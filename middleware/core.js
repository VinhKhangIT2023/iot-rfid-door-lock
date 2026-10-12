// Pure logic shared by Node-RED functions and offline tests.
const BASE = 'iot/nhom25/door8/w4-927-a61c';
const FRESHNESS_MS = 12000;
function initial() {
  return {online:false, broker:false, state:null, freshAt:0, seq:0,
    alerts:[], history:[], ruleHistory:[], alarm:false, leftOpen:false};
}
function saveRule(model, row) {
  model.ruleHistory.push(row);
  model.ruleHistory=model.ruleHistory.slice(-200);
  return row;
}
function ruleAlert(model, ruleId, kind, text, row) {
  const observedSession=model.state?model.state.session:null;
  model.alerts.push({time_utc:row.time_utc, rule_id:ruleId, kind, text,
    observed_session:observedSession});
  model.alerts=model.alerts.slice(-50);
  return saveRule(model,{type:'rule', time_utc:row.time_utc, rule_id:ruleId,
    kind, outcome:'alert_created', source_event:row.data.evt,
    source_uptime_ms:Number.isFinite(row.data.uptime_ms)?row.data.uptime_ms:null,
    observed_session:observedSession, session_source:'observed_state'});
}
function recordRuleAction(model, request, result, now) {
  if(!request || request.source!=='rule-door-forced') return null;
  return saveRule(model,{type:'rule_action', time_utc:new Date(now).toISOString(),
    rule_id:'R1', kind:'DOOR_FORCED', action:request.action,
    outcome:result.error?'blocked':'sent', reason:result.error||null,
    sequence:result.error?null:JSON.parse(result.payload).seq,
    observed_session:request.observed_session||null, session_source:'observed_state',
    trigger_time_utc:request.trigger_time_utc});
}
function ingest(model, topic, payload, retained, now) {
  if(typeof topic!=='string' || !topic.startsWith(BASE+'/')) return {error:'topic'};
  const suffix=topic.slice(BASE.length+1);
  if (!['availability','state','event','ack','cmd'].includes(suffix)) return {error:'topic'};
  let data;
  try { data=suffix==='availability'?String(payload):JSON.parse(String(payload)); }
  catch(e) { return {error:'invalid_json'}; }
  if(suffix==='availability' && !['online','offline'].includes(data)) return {error:'availability_schema'};
  if(suffix==='state' && (!data || !['LOCKED','UNLOCKED_WAIT_OPEN','DOOR_OPEN_AUTH','ALARM'].includes(data.state) || !/^[a-f0-9]{16}$/i.test(data.session||'') || !['OPEN','CLOSED'].includes(data.door))) return {error:'state_schema'};
  if(suffix==='event' && (!data || Array.isArray(data) || typeof data.evt!=='string' || !data.evt)) return {error:'event_schema'};
  const row={time_utc:new Date(now).toISOString(),topic,retained:!!retained,data};
  model.history.push(row); model.history=model.history.slice(-200);
  let request=null, rule=null;
  if(suffix==='availability') { model.online=data==='online'; if(!model.online) model.freshAt=0; }
  if(suffix==='state') {
    if(!retained) {
      if(!model.state || model.state.session!==data.session) {
        model.seq=0; model.alarm=false; model.leftOpen=false;
      }
      model.state=data; model.freshAt=now;
      if(data.state!=='ALARM') model.alarm=false;
      if(data.door==='CLOSED') model.leftOpen=false;
    }
  }
  if(suffix==='cmd' && data && model.state && data.session===model.state.session && Number.isInteger(data.seq)) model.seq=Math.max(model.seq,data.seq);
  if(suffix==='ack') model.ack={...data,received_at:row.time_utc};
  if(suffix==='event' && !retained && data.evt==='DOOR_CLOSED') model.leftOpen=false;
  // R1 requests status once per alarm, through the normal command guard.
  if(suffix==='event' && !retained && data && data.evt==='DOOR_FORCED' && !model.alarm) {
    model.alarm=true;
    rule=ruleAlert(model,'R1','DOOR_FORCED','Cửa mở khi chưa được cấp quyền',row);
    request={action:'status',source:'rule-door-forced',rule_id:'R1',
      observed_session:rule.observed_session,trigger_time_utc:row.time_utc};
  }
  // R2 is a reminder for an authorized open door, not a forced-opening alarm.
  // Require a direct observed OPEN state; retained startup state is insufficient.
  if(suffix==='event' && !retained && data.evt==='LEFT_OPEN_WARN' &&
      data.state==='DOOR_OPEN_AUTH' && model.freshAt && model.state &&
      model.state.state==='DOOR_OPEN_AUTH' && model.state.door==='OPEN' && !model.leftOpen) {
    model.leftOpen=true;
    rule=ruleAlert(model,'R2','LEFT_OPEN_WARN','Cửa mở hợp lệ quá lâu, vui lòng đóng cửa',row);
  }
  return {row,request,rule};
}
function command(model, action, now) {
  if(!['unlock','status'].includes(action)) return {error:'action'};
  if(!model.broker || !model.online || !model.state || !model.freshAt || now-model.freshAt>FRESHNESS_MS) return {error:'offline_or_stale'};
  // Epoch seconds make a restarted controller less likely to reuse a sequence.
  // Observed cmd messages also raise the counter. Still use one controller.
  model.seq=Math.max(model.seq+1,Math.floor(now/1000));
  return {topic:BASE+'/cmd',payload:JSON.stringify({session:model.state.session,seq:model.seq,action}),qos:1,retain:false};
}
module.exports={BASE,FRESHNESS_MS,initial,ingest,command,recordRuleAction};
