const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const t=require('./telegram_notifications'),c=require('./core');
const epoch=1791964800000,session='0123456789abcdef';
const cfg={enabled:true,botToken:'123456:fixture_only_abcdefghijklmnop',chatId:'123456789',deviceName:'Nhóm 25 · Cửa 01'};
const rule=(id='R1',n=1)=>({type:'rule',rule_id:id,kind:id==='R1'?'DOOR_FORCED':'LEFT_OPEN_WARN',
  outcome:'alert_created',source_event:id==='R1'?'DOOR_FORCED':'LEFT_OPEN_WARN',time_utc:new Date(epoch+n).toISOString(),
  source_uptime_ms:n,event_session:session,observed_session:session,session_verified:true});
const success=async()=>({ok:true,status:200,json:async()=>({ok:true,result:{message_id:42}})});
const cases=[];const test=(name,run)=>cases.push({name,run});
test('Missing/invalid local config is safe and produces no request',async()=>{
  assert.equal(t.loadConfig(path.join(__dirname,'fixture-does-not-exist.json')).configError,'not_configured');
  const n=t.createNotifier({readConfig:()=>{throw Error('bad config');},fetchImpl:()=>{throw Error('must not fetch');},now:()=>epoch+20});
  const out=await n.notify(rule());assert.equal(out.outcome,'disabled');assert.equal(out.reason,'config_json');n.close();
});
test('Disabled mode and invalid credentials cannot send',async()=>{
  for(const config of [{...cfg,enabled:false},{...cfg,botToken:''},{...cfg,chatId:'-100123'}]){
    let calls=0;const n=t.createNotifier({readConfig:()=>config,fetchImpl:async()=>{calls++;return success();},now:()=>epoch+20});
    const out=await n.notify(rule());assert.notEqual(out.outcome,'api_accepted');assert.equal(calls,0);n.close();
  }
});
test('Only verified R1/R2 rule creation is allowed; not raw/retained/replayed actions',async()=>{
  let calls=0;const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;return success();},now:()=>epoch+20});
  for(const input of [null,{...rule(),type:'rule_action'},{...rule(),session_verified:false},
    {...rule(),event_session:'ffffffffffffffff'},{...rule(),kind:'UNKNOWN'},{evt:'DOOR_FORCED'}, {...rule(),time_utc:'bad'}]){
    assert.equal((await n.notify(input)).reason,'invalid_rule');
  }assert.equal(calls,0);n.close();
});
test('R1/R2 text, HTTPS method and selected private recipient; no secrets in result',async()=>{
  const sent=[];const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async(url,options)=>{sent.push({url,options,body:JSON.parse(options.body)});return success();},now:()=>epoch+20});
  const out=await n.notify(rule());await n.notify(rule('R2'));
  assert.equal(out.outcome,'api_accepted');assert.equal(sent.length,2);
  assert.equal(sent[0].url,'https://api.telegram.org/bot'+cfg.botToken+'/sendMessage');assert.equal(sent[0].options.method,'POST');
  assert.equal(sent[0].options.redirect,'error');assert.equal(sent[0].body.chat_id,cfg.chatId);
  assert.match(sent[0].body.text,/R1.*Mở cửa trái phép/);assert.match(sent[1].body.text,/R2.*Nhắc đóng cửa/);assert.match(sent[1].body.text,/15 giây/);
  assert.equal(sent[0].body.parse_mode,undefined);assert(!JSON.stringify(out).includes(cfg.botToken));assert(!JSON.stringify(out).includes(cfg.chatId));n.close();
});
test('One send per rule row, later episode and R2 independent',async()=>{
  let calls=0;const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;return success();},now:()=>epoch+20});
  await n.notify(rule());assert.equal((await n.notify(rule())).reason,'duplicate');await n.notify(rule('R1',2));await n.notify(rule('R2',1));assert.equal(calls,3);n.close();
});
test('At most one request in flight; bounded pending queue drops overload',async()=>{
  let release,calls=0;const gate=new Promise(resolve=>release=resolve);
  const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;await gate;return success();},now:()=>epoch+20,maxPending:2});
  const a=n.notify(rule('R1',1)),b=n.notify(rule('R1',2));assert.equal((await n.notify(rule('R1',3))).reason,'queue_full');assert.equal(calls,1);
  release();await Promise.all([a,b]);assert.equal(calls,2);n.close();
});
test('Expired queued rule is not sent after slow network',async()=>{
  let release,calls=0,clock=epoch+20;const gate=new Promise(resolve=>release=resolve);
  const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;await gate;return success();},now:()=>clock});
  const a=n.notify(rule()),b=n.notify(rule('R2'));clock+=61000;release();await a;assert.equal((await b).reason,'stale');assert.equal(calls,1);n.close();
});
test('Disabling config skips queued rule without modifying door logic',async()=>{
  let release,current=cfg,calls=0;const gate=new Promise(resolve=>release=resolve);
  const n=t.createNotifier({readConfig:()=>current,fetchImpl:async()=>{calls++;await gate;return success();},now:()=>epoch+20});
  const a=n.notify(rule()),b=n.notify(rule('R2'));current={...cfg,enabled:false};release();await a;assert.equal((await b).outcome,'disabled');assert.equal(calls,1);n.close();
});
test('API refusal is logged safely with no automatic retry',async()=>{
  let calls=0;const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({ok:false,error_code:429,description:cfg.botToken})};},now:()=>epoch+20});
  const out=await n.notify(rule());assert.equal(out.reason,'telegram_429');assert(!JSON.stringify(out).includes(cfg.botToken));assert.equal(calls,1);assert.equal((await n.notify(rule())).reason,'duplicate');n.close();
});
test('Network failure is sanitized; no rejected promise or token URL in logs',async()=>{
  const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{throw Error('failed https://api.telegram.org/bot'+cfg.botToken);},now:()=>epoch+20});
  const out=await n.notify(rule());assert.equal(out.reason,'network_or_timeout');assert(!JSON.stringify(out).includes(cfg.botToken));n.close();
});
test('Node shutdown cancels queued and active work; never sends future rules',async()=>{
  let calls=0;const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));},now:()=>epoch+20});
  const a=n.notify(rule()),b=n.notify(rule('R2'));n.close();assert.equal((await a).outcome,'closed');assert.equal((await b).outcome,'closed');assert.equal((await n.notify(rule('R1',3))).outcome,'closed');assert.equal(calls,1);
});
test('Actual core rule output and flow wiring: no new unlock path',async()=>{
  const flow=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8'));
  assert.deepEqual(flow.find(n=>n.id==='ingest').wires[2],['debug','telegram-notify']);
  assert.deepEqual(flow.find(n=>n.id==='telegram-notify').wires,[['log','debug']]);
  const m=c.initial();m.broker=true;c.ingest(m,c.BASE+'/state',JSON.stringify({state:'LOCKED',door:'CLOSED',session}),false,epoch);
  const ingest=id=>c.ingest(m,c.BASE+'/event',JSON.stringify({evt:'DOOR_FORCED',session:id,state:'ALARM',uptime_ms:1}),false,epoch+1);
  assert.equal(ingest('ffffffffffffffff').rule,null);
  const good=ingest(session);assert.equal(good.request.action,'status');assert.equal(ingest(session).rule,null);
  let calls=0;const n=t.createNotifier({readConfig:()=>cfg,fetchImpl:async()=>{calls++;return success();},now:()=>epoch+20});
  await n.notify(good.rule);assert.equal(calls,1);assert.equal(m.alerts.length,1);n.close();
});
test('Generated notification function and lifecycle log only safe delivery rows',async()=>{
  const flow=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8')),def=flow.find(n=>n.id==='telegram-notify');
  const values={},ctx={get:key=>values[key],set:(key,val)=>values[key]=val},logged=[],warnings=[];
  const global={get:()=>({createNotifier:()=>t.createNotifier({readConfig:()=>cfg,fetchImpl:success,now:()=>epoch+20})})};
  new Function('context','global',def.initialize)(ctx,global);
  const fn=new Function('msg','context','node',def.func);assert.equal(fn({payload:rule()},ctx,{send:x=>logged.push(x),warn:x=>warnings.push(x)}),null);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(logged.length,1);assert.equal(JSON.parse(logged[0].payload).outcome,'api_accepted');assert.equal(warnings.length,0);
  new Function('context',def.finalize)(ctx);assert.equal((await values.sender.notify(rule('R1',2))).outcome,'closed');
});
(async()=>{let failures=0;for(const item of cases){try{await item.run();console.log('PASS: '+item.name);}catch(error){failures++;console.error('FAIL: '+item.name+' — '+error.message);}}
console.log(`SUMMARY: ${cases.length-failures}/${cases.length} Telegram fixtures passed. All Telegram HTTP requests mocked; no real message sent.`);process.exitCode=failures?1:0;})();
