// Current-firmware session regression. Local fixtures only; never publishes MQTT.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),c=require('./core');
const A='0123456789abcdef',B='fedcba9876543210',now=1791910000000;
const topic=s=>c.BASE+'/'+s,tests=[];
function test(name,fn){tests.push({name,fn});}
function state(m,id=A,door='CLOSED',name='LOCKED',at=now){return c.ingest(m,topic('state'),JSON.stringify({session:id,door,state:name,lockout:false}),false,at);}
function live(id=A,door='CLOSED',name='LOCKED'){const m=c.initial();m.broker=true;state(m,id,door,name);return m;}
function event(m,evt,session=A,detail='',name='LOCKED'){return c.ingest(m,topic('event'),JSON.stringify({evt,session,detail,state:name,uptime_ms:100}),false,now+1);}
function ack(m,session=A,seq=10,retained=false){return c.ingest(m,topic('ack'),JSON.stringify({session,seq,result:'executed',state:'LOCKED'}),retained,now+1);}
test('Old-session RFID remains in raw history but cannot inflate activity',()=>{const m=live(B),r=event(m,'UNLOCK_GRANTED',A,'src=RFID uid=01020304 name=blue');assert.equal(m.rfidCounts.total,0);assert.equal(m.rfidHistory.length,0);assert.equal(r.row.ignored_reason,'old_session');assert.equal(m.history.at(-1).data.session,A);});
test('Old-session forced opening cannot create an alert or status request',()=>{const m=live(B),r=event(m,'DOOR_FORCED',A,'','ALARM');assert.equal(m.alerts.length,0);assert.equal(r.request,null);assert.equal(m.alarm,false);});
test('Old-session CLOSED cannot reset the current R2 episode',()=>{const m=live(B,'OPEN','DOOR_OPEN_AUTH');m.leftOpen=true;event(m,'DOOR_CLOSED',A,'','DOOR_OPEN_AUTH');assert.equal(m.leftOpen,true);});
test('Old-session warning cannot create R2 in a new opening',()=>{const m=live(B,'OPEN','DOOR_OPEN_AUTH');event(m,'LEFT_OPEN_WARN',A,'','DOOR_OPEN_AUTH');assert.equal(m.alerts.length,0);assert.equal(m.leftOpen,false);});
test('Missing session cannot act as a current-firmware event',()=>{const m=live(),r=c.ingest(m,topic('event'),JSON.stringify({evt:'DOOR_FORCED',state:'ALARM'}),false,now+1);assert.equal(m.alerts.length,0);assert.equal(r.row.ignored_reason,'session_missing_or_invalid');});
test('Tagged event before direct state is logged without being replayed',()=>{const m=c.initial(),r=event(m,'UNLOCK_GRANTED',A,'src=RFID uid=01020304 name=blue');assert.equal(m.rfidCounts.total,0);assert.equal(r.row.ignored_reason,'waiting_direct_state');state(m);assert.equal(m.rfidCounts.total,0);});
test('Old or retained ACK cannot overwrite the live ACK',()=>{const m=live();ack(m,A,10);ack(m,B,11);ack(m,A,12,true);assert.equal(m.ack.seq,10);assert.equal(m.ack.session,A);});
test('Malformed ACK is rejected instead of becoming application data',()=>{const m=live();for(const value of ['null','[]','"text"','{}'])assert.equal(c.ingest(m,topic('ack'),value,false,now).error,'ack_schema');assert.equal(m.ack,null);});
test('New direct session clears the old ACK, retained session does not',()=>{const m=live();ack(m);c.ingest(m,topic('state'),JSON.stringify({session:B,door:'CLOSED',state:'LOCKED'}),true,now+1);assert.equal(m.ack.seq,10);state(m,B,'CLOSED','LOCKED',now+2);assert.equal(m.ack,null);});
test('Late direct state from a retired session cannot restore old authority',()=>{const m=live();state(m,B,'CLOSED','LOCKED',now+2);ack(m,B,20);const r=state(m,A,'OPEN','ALARM',now+3);assert.equal(r.row.ignored_reason,'retired_session');assert.equal(m.state.session,B);assert.equal(m.state.state,'LOCKED');assert.equal(m.ack.seq,20);assert.equal(m.freshAt,now+2);assert.equal(JSON.parse(c.command(m,'status',now+3).payload).session,B);});
test('Matching event preserves verified and observed session provenance',()=>{const m=live(),r=event(m,'UNLOCK_GRANTED',A,'src=RFID uid=01020304 name=blue');assert.equal(m.rfidCounts.accepted,1);assert.equal(m.rfidHistory[0].event_session,A);assert.equal(m.rfidHistory[0].session_verified,true);assert.equal(r.row.ignored_reason,undefined);const force=event(m,'DOOR_FORCED',A,'','ALARM');assert.equal(force.rule.event_session,A);assert.equal(force.rule.session_verified,true);});
test('HTTP accepted response includes the same session as its MQTT command',()=>{const flows=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8')),auth=new Function('msg','flow','global','node','env',flows.find(n=>n.id==='auth').func),m=live();state(m,A,'CLOSED','LOCKED',Date.now());const r=auth({req:{headers:{authorization:'Bearer fixture-only'}},payload:{action:'status'}},{get:()=>m,set(){}},{get:()=>c},{},{get:()=> 'fixture-only'});assert.equal(r[1].statusCode,202);assert.equal(r[1].payload.session,JSON.parse(r[0].payload).session);});
test('Web does not confirm a same-sequence ACK from another session',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../application/dashboard.js'),'utf8');
  const body=source.slice(source.indexOf('function renderAck('),source.indexOf('function renderHistory('));
  const nodes={},notices=[];const el=id=>nodes[id]||(nodes[id]={textContent:''});
  const run=new Function('el','stamp','notice','lockButtons','pending','d',body+';renderAck(d);return pending;');
  const pending={seq:10,session:A,action:'unlock',started:Date.now()};
  const wrong=run(el,()=>'',s=>notices.push(s),()=>{},pending,{state:{session:A},ack:{seq:10,session:B,result:'executed'}});
  assert.equal(wrong,pending);assert.equal(notices.length,0);
  assert.equal(run(el,()=>'',s=>notices.push(s),()=>{},pending,{state:{session:A},ack:{seq:10,session:A,result:'executed'}}),null);
  assert.match(notices[0],/đã xử lý/);
});
test('Web cancels a pending command when the observed device session changes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../application/dashboard.js'),'utf8');
  const labels=source.slice(source.indexOf('const stateLabels='),source.indexOf('const outcomeLabels='));
  const body=source.slice(source.indexOf('function renderConnection('),source.indexOf('function rfidDetail('));
  const nodes={},notices=[],el=id=>nodes[id]||(nodes[id]={classList:{toggle(){}},dataset:{},replaceChildren(){}});
  const run=new Function('el','node','document','notice','lockButtons','pending','d',labels+'let ready=false;'+body+';renderConnection(d);return pending;');
  const result=run(el,()=>({}),{createTextNode:v=>v},s=>notices.push(s),()=>{},{seq:10,session:A},{ready:true,connection:'ready',age_ms:0,state:{state:'LOCKED',door:'CLOSED',session:B,lockout:false}});
  assert.equal(result,null);assert.match(notices[0],/Phiên thiết bị đã thay đổi/);
});
let failed=0;for(const t of tests){try{t.fn();console.log('PASS: '+t.name);}catch(e){failed++;console.error('FAIL: '+t.name+' — '+e.message);}}
console.log(`SUMMARY: ${tests.length-failed}/${tests.length} week 9 session regression fixtures passed. No Wokwi, other-person or video evidence implied.`);process.exitCode=failed?1:0;
