// Week 7 regression tests. All telemetry is a local fixture, never published.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const c = require('./core');
const now = 1791800000000;
const session = '0123456789abcdef';
const topic = suffix => c.BASE + '/' + suffix;
function state(model, door = 'OPEN', name = 'DOOR_OPEN_AUTH', at = now, id = session, retained = false) {
  return c.ingest(model, topic('state'), JSON.stringify({state:name, door, session:id}), retained, at);
}
function live(door = 'OPEN', name = 'DOOR_OPEN_AUTH') {
  const model = c.initial(); model.broker = true;
  c.ingest(model, topic('availability'), 'online', false, now);
  state(model, door, name);
  return model;
}
function event(model, evt = 'LEFT_OPEN_WARN', name = 'DOOR_OPEN_AUTH', at = now + 1, retained = false) {
  return c.ingest(model, topic('event'), JSON.stringify({evt, state:name, session:model.state?.session||session, uptime_ms:15001}), retained, at);
}
const cases = [];
function test(name, run) { cases.push({name, run}); }

test('R2 creates one alert and one rule row without any command', () => {
  const m=live(), r=event(m);
  assert.strictEqual(m.alerts.length,1);
  assert.strictEqual(m.alerts[0].kind,'LEFT_OPEN_WARN');
  assert.strictEqual(m.alerts[0].rule_id,'R2');
  assert.strictEqual(r.request,null);
  assert.strictEqual(r.rule.rule_id,'R2');
  assert.strictEqual(r.rule.observed_session,session);
  assert.strictEqual(r.rule.session_source,'observed_state');
  assert.strictEqual(m.state.state,'DOOR_OPEN_AUTH');
});
test('R2 duplicate event is suppressed in the same opening', () => {
  const m=live(); event(m); const r=event(m);
  assert.strictEqual(m.alerts.length,1); assert.strictEqual(m.ruleHistory.length,1);
  assert.strictEqual(r.rule,null); assert.strictEqual(r.request,null);
});
test('OPEN heartbeat does not reset R2', () => {
  const m=live(); event(m); state(m,'OPEN','DOOR_OPEN_AUTH',now+5000); event(m);
  assert.strictEqual(m.alerts.length,1);
});
test('DOOR_CLOSED event resets R2 before the next opening', () => {
  const m=live(); event(m); event(m,'DOOR_CLOSED','DOOR_OPEN_AUTH',now+2);
  state(m,'OPEN','DOOR_OPEN_AUTH',now+3); event(m,'LEFT_OPEN_WARN','DOOR_OPEN_AUTH',now+4);
  assert.strictEqual(m.alerts.length,2);
});
test('CLOSED state resets R2', () => {
  const m=live(); event(m); state(m,'CLOSED','DOOR_OPEN_AUTH',now+2);
  state(m,'OPEN','DOOR_OPEN_AUTH',now+3); event(m);
  assert.strictEqual(m.alerts.length,2);
});
test('New direct session resets both rule flags', () => {
  const m=live(); event(m); event(m,'DOOR_FORCED','ALARM');
  state(m,'OPEN','DOOR_OPEN_AUTH',now+3,'fedcba9876543210'); event(m);
  const r=event(m,'DOOR_FORCED','ALARM');
  assert.strictEqual(m.alerts.filter(a=>a.kind==='LEFT_OPEN_WARN').length,2);
  assert(r.request && r.request.action==='status');
});
test('Retained event creates neither rule nor alert', () => {
  const m=live(); const r=event(m,'LEFT_OPEN_WARN','DOOR_OPEN_AUTH',now+1,true);
  assert.strictEqual(m.alerts.length,0); assert.strictEqual(r.rule,null);
  assert.strictEqual(r.request,null);
});
test('Retained CLOSED state and retained DOOR_CLOSED do not reset R2', () => {
  const m=live(); event(m); state(m,'CLOSED','LOCKED',now+2,session,true);
  event(m,'DOOR_CLOSED','DOOR_OPEN_AUTH',now+3,true); event(m);
  assert.strictEqual(m.alerts.length,1);
});
test('Retained new session does not reset R2', () => {
  const m=live(); event(m); state(m,'OPEN','DOOR_OPEN_AUTH',now+2,'fedcba9876543210',true); event(m);
  assert.strictEqual(m.alerts.length,1);
});
test('R2 rejects an event that says ALARM', () => {
  const m=live(); event(m,'LEFT_OPEN_WARN','ALARM');
  assert.strictEqual(m.alerts.length,0);
});
test('R2 rejects a warning while observed door is CLOSED/LOCKED', () => {
  const m=live('CLOSED','LOCKED'); event(m);
  assert.strictEqual(m.alerts.length,0);
});
test('R2 waits for a direct compatible state after middleware starts', () => {
  const m=c.initial(); m.broker=true;
  state(m,'OPEN','DOOR_OPEN_AUTH',now,session,true); event(m);
  assert.strictEqual(m.alerts.length,0);
  state(m); event(m); assert.strictEqual(m.alerts.length,1);
});
test('R1 and R2 use separate deduplication flags', () => {
  const m=live(); event(m); event(m,'DOOR_FORCED','ALARM');
  event(m); event(m,'DOOR_FORCED','ALARM');
  assert.deepStrictEqual(m.alerts.map(a=>a.kind),['LEFT_OPEN_WARN','DOOR_FORCED']);
});
test('R1 duplicate is suppressed, recovery allows the next alarm', () => {
  const m=live('CLOSED','LOCKED'); event(m,'DOOR_FORCED','ALARM');
  event(m,'DOOR_FORCED','ALARM'); assert.strictEqual(m.alerts.length,1);
  state(m,'CLOSED','LOCKED',now+2); event(m,'DOOR_FORCED','ALARM');
  assert.strictEqual(m.alerts.length,2);
});
test('Malformed JSON, null event and invalid state do not trigger rules', () => {
  const m=live(); const count=m.history.length;
  assert(c.ingest(m,topic('event'),'bad',false,now).error);
  assert(c.ingest(m,topic('event'),'null',false,now).error);
  assert(c.ingest(m,topic('state'),'{}',false,now).error);
  assert.strictEqual(m.alerts.length,0); assert.strictEqual(m.history.length,count);
});
test('Wrong BASE is rejected without changing history', () => {
  const m=live(), count=m.history.length;
  assert(c.ingest(m,'unrelated/'+topic('event'),JSON.stringify({evt:'DOOR_FORCED'}),false,now).error);
  assert.strictEqual(m.history.length,count); assert.strictEqual(m.alerts.length,0);
});
test('Freshness accepts exactly 12000 ms and blocks 12001 ms', () => {
  const m=live('CLOSED','LOCKED');
  assert(!c.command(m,'status',now+12000).error);
  assert.strictEqual(c.command(m,'status',now+12001).error,'offline_or_stale');
});
test('Offline and broker disconnected block all commands', () => {
  const m=live(); c.ingest(m,topic('availability'),'offline',false,now+1);
  assert(c.command(m,'unlock',now+1).error);
  c.ingest(m,topic('availability'),'online',false,now+2); state(m);
  m.broker=false; assert(c.command(m,'status',now+2).error);
});
test('R1 blocked status is recorded once and not automatically retried', () => {
  const m=live('CLOSED','LOCKED'); const r=event(m,'DOOR_FORCED','ALARM',now+13000);
  const result=c.command(m,r.request.action,now+13000);
  const row=c.recordRuleAction(m,r.request,result,now+13000);
  assert.strictEqual(row.outcome,'blocked'); assert.strictEqual(row.reason,'offline_or_stale');
  assert.strictEqual(row.sequence,null);
  state(m,'OPEN','ALARM',now+13001);
  assert.strictEqual(event(m,'DOOR_FORCED','ALARM',now+13002).request,null);
});
test('R1 sent status records the exact command sequence', () => {
  const m=live('CLOSED','LOCKED'), r=event(m,'DOOR_FORCED','ALARM');
  const result=c.command(m,r.request.action,now+1), row=c.recordRuleAction(m,r.request,result,now+1);
  assert.strictEqual(row.outcome,'sent');
  assert.strictEqual(row.sequence,JSON.parse(result.payload).seq);
  assert.strictEqual(result.retain,false);
});
test('Rule history and alert history are bounded', () => {
  const m=live();
  for(let i=0;i<220;i++) { state(m,'CLOSED','LOCKED',now+i*3); state(m,'OPEN','DOOR_OPEN_AUTH',now+i*3+1); event(m,'LEFT_OPEN_WARN','DOOR_OPEN_AUTH',now+i*3+2); }
  assert.strictEqual(m.ruleHistory.length,200); assert.strictEqual(m.alerts.length,50);
  assert.strictEqual(m.history.length,200);
});
test('Generated ingestion function logs telemetry and rule as separate rows', () => {
  const nodes=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8'));
  const f=nodes.find(n=>n.id==='ingest'); const fn=new Function('msg','flow','global','node','env',f.func);
  let m=live(); const flow={get:()=>m,set:(_,value)=>{m=value;}};
  const result=fn({topic:topic('event'),payload:JSON.stringify({evt:'LEFT_OPEN_WARN',state:'DOOR_OPEN_AUTH',session}),retain:false},flow,{get:()=>c},{warn:()=>{}},{});
  assert(Array.isArray(result[0])); assert.strictEqual(result[0].length,2);
  assert.strictEqual(JSON.parse(result[0][1].payload).rule_id,'R2');
  assert.strictEqual(result[1],null);
});
test('Generated R1 command function logs a blocked action without publishing', () => {
  const nodes=JSON.parse(fs.readFileSync(path.join(__dirname,'flows.json'),'utf8'));
  const f=nodes.find(n=>n.id==='command'); const fn=new Function('msg','flow','global','node','env',f.func);
  let m=live(); m.online=false; const request=event(m,'DOOR_FORCED','ALARM').request;
  const result=fn(request,{get:()=>m,set:(_,v)=>{m=v;}},{get:()=>c},{warn:()=>{}},{});
  assert.strictEqual(result[0],null); assert.strictEqual(JSON.parse(result[1].payload).outcome,'blocked');
});

let failed=0;
for(const {name,run} of cases) {
  try { run(); console.log('PASS: '+name); }
  catch(error) { failed++; console.error('FAIL: '+name+' — '+error.message); }
}
console.log(`SUMMARY: ${cases.length-failed}/${cases.length} passed. OFFLINE FIXTURES ONLY; no Wokwi or live MQTT evidence.`);
process.exitCode=failed?1:0;
