const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),c=require('./core');
const now=1791810000000,topic=suffix=>c.BASE+'/'+suffix;
const event=(m,evt,detail,retained=false,at=now)=>{
  if(!m.state)c.ingest(m,topic('state'),JSON.stringify({state:'LOCKED',door:'CLOSED',session:'0123456789abcdef'}),false,at);
  return c.ingest(m,topic('event'),JSON.stringify({evt,detail,state:'LOCKED',session:m.state.session,uptime_ms:10}),retained,at);
};
const cases=[];
const test=(name,run)=>cases.push({name,run});
test('Actual RFID grant format yields UID/name; remote and serial unlocks are excluded',()=>{
  const m=c.initial();event(m,'UNLOCK_GRANTED','src=RFID uid=01020304 name=blue');
  event(m,'UNLOCK_GRANTED','src=REMOTE cmd=unlock');
  event(m,'UNLOCK_GRANTED','src=SERIAL uid=01020304 name=blue');
  assert.equal(m.rfidHistory.length,1);assert.equal(m.rfidHistory[0].uid,'01020304');assert.equal(m.rfidHistory[0].name,'blue');
  assert.deepEqual(m.rfidCounts,{total:1,accepted:1,denied:0,ignored:0});
});
test('Denied and ignored scans remain distinct; lockout events do not inflate scan totals',()=>{
  const m=c.initial();event(m,'CARD_DENIED','uid=AABBCCDD fail=2/3');
  event(m,'LOCKOUT_START','too many invalid cards');event(m,'CARD_IGNORED_LOCKOUT','uid=01020304');event(m,'LOCKOUT_END','');
  assert.deepEqual(m.rfidHistory.map(r=>r.outcome),['denied','lockout_start','ignored','lockout_end']);
  assert.equal(m.rfidHistory[0].attempt,2);assert.equal(m.rfidHistory[0].attempt_limit,3);
  assert.deepEqual(m.rfidCounts,{total:2,accepted:0,denied:1,ignored:1});
});
test('Retained RFID events cannot fabricate scans, counts or lockout history',()=>{
  const m=c.initial();event(m,'UNLOCK_GRANTED','src=RFID uid=01020304 name=blue',true);
  event(m,'CARD_DENIED','uid=AABBCCDD fail=1/3',true);event(m,'LOCKOUT_START','',true);
  assert.equal(m.rfidHistory.length,0);assert.equal(m.rfidCounts.total,0);
});
test('Missing or malformed UID and partial RFID source do not create a scan',()=>{
  const m=c.initial();
  for(const detail of ['src=RFID','src=RFID uid=01020304<script>','src=RFID uid=GGGGGGGG','src=RFID_TEST uid=01020304','src=RFID uid=123456']){
    event(m,'UNLOCK_GRANTED',detail);
  }
  assert.equal(m.rfidHistory.length,0);
  event(m,'CARD_DENIED','uid=04112233445566 fail=1/3');assert.equal(m.rfidHistory[0].uid,'04112233445566');
});
test('Heartbeat traffic cannot evict RFID activity; dedicated history is bounded',()=>{
  const m=c.initial();event(m,'CARD_DENIED','uid=AABBCCDD fail=1/3');
  const state={state:'LOCKED',door:'CLOSED',lockout:false,session:'0123456789abcdef'};
  for(let i=0;i<240;i++)c.ingest(m,topic('state'),JSON.stringify(state),false,now+i);
  assert.equal(m.history.length,200);assert.equal(m.rfidHistory.length,1);
  for(let i=0;i<120;i++)event(m,'CARD_DENIED','uid=AABBCCDD fail=1/3',false,now+250+i);
  assert.equal(m.rfidHistory.length,100);assert.equal(m.rfidCounts.total,121);
});
test('Session is verified against direct state; reconnect preserves monitoring history and counters',()=>{
  const m=c.initial(),state={state:'LOCKED',door:'CLOSED',lockout:false,session:'0123456789abcdef'};
  c.ingest(m,topic('state'),JSON.stringify(state),false,now);event(m,'CARD_DENIED','uid=AABBCCDD fail=1/3');
  assert.equal(m.rfidHistory[0].observed_session,state.session);assert.equal(m.rfidHistory[0].session_source,'observed_state');
  c.ingest(m,topic('state'),JSON.stringify({...state,session:'fedcba9876543210'}),false,now+1);
  assert.equal(m.rfidHistory.length,1);assert.equal(m.rfidCounts.total,1);
  assert.equal(c.initial().rfidCounts.total,0);
});
test('API distinguishes broker, device, missing state and stale data without changing command guards',()=>{
  const m=c.initial();assert.equal(c.view(m,now).connection,'broker_offline');m.broker=true;
  assert.equal(c.view(m,now).connection,'device_offline');m.online=true;assert.equal(c.view(m,now).connection,'waiting_state');
  c.ingest(m,topic('state'),JSON.stringify({state:'LOCKED',door:'CLOSED',lockout:true,session:'0123456789abcdef'}),false,now);
  assert.equal(c.view(m,now+12000).ready,true);assert.equal(c.view(m,now+12001).connection,'stale');
  assert.equal(c.command(m,'unlock',now+12001).error,'offline_or_stale');
  c.ingest(m,topic('availability'),'offline',false,now+2);assert.equal(c.view(m,now+2).ready,false);
  assert.equal(c.view(m,now+2).state.lockout,true);assert.equal(c.view(m,now+2).age_ms,null);
});
test('Generated HTTP view exposes RFID data, and generated HTML embeds local CSS/JS',()=>{
  const flows=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8'));
  const fn=new Function('msg','flow','global',flows.find(n=>n.id==='view').func),m=c.initial();
  event(m,'CARD_DENIED','uid=AABBCCDD fail=1/3');
  const result=fn({},{get:()=>m},{get:()=>c});assert.equal(result.payload.rfid_counts.denied,1);
  const html=flows.find(n=>n.id==='html').template;
  assert(html.includes('id="rfid-history"'));assert(html.includes('function renderRfid'));
  assert(html.includes('--navy:'));assert(!html.includes('<!-- APP_SCRIPT -->'));assert(!html.includes('<!-- APP_STYLES -->'));
});
let failures=0;
for(const {name,run} of cases){try{run();console.log('PASS: '+name);}catch(error){failures++;console.error('FAIL: '+name+' — '+error.message);}}
console.log('SUMMARY: '+(cases.length-failures)+'/'+cases.length+' dashboard logic tests passed. Offline fixtures; no live card scan implied.');
process.exitCode=failures?1:0;
