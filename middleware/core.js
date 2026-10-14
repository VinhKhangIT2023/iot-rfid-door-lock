// Pure logic shared by Node-RED functions and offline tests.
const BASE = 'iot/nhom25/door8/w4-927-a61c';
const FRESHNESS_MS = 12000;
function initial() {
  return {online:false, broker:false, state:null, freshAt:0, seq:0,
    alerts:[], history:[], ruleHistory:[], alarm:false, leftOpen:false,
    rfidHistory:[], retiredSessions:[], rfidCounts:{total:0,accepted:0,denied:0,ignored:0}};
}
function recordRfid(model, row) {
  const data=row.data;
  if(row.retained || !row.topic.endsWith('/event')) return;
  const detail=typeof data.detail==='string'?data.detail:'';
  let outcome;
  if(data.evt==='UNLOCK_GRANTED' && /(?:^|\s)src=RFID(?:\s|$)/.test(detail)) outcome='accepted';
  else if(data.evt==='CARD_DENIED') outcome='denied';
  else if(data.evt==='CARD_IGNORED_LOCKOUT') outcome='ignored';
  else if(data.evt==='LOCKOUT_START') outcome='lockout_start';
  else if(data.evt==='LOCKOUT_END') outcome='lockout_end';
  else return;
  const uidMatch=detail.match(/(?:^|\s)uid=([a-f0-9]+)(?=\s|$)/i);
  const uid=uidMatch && [8,14,20].includes(uidMatch[1].length)?uidMatch[1].toUpperCase():null;
  if(['accepted','denied','ignored'].includes(outcome) && !uid) return;
  const name=detail.match(/(?:^|\s)name=(.+?)(?=\s+(?:uid|src|reason|fail)=|$)/);
  const reason=detail.match(/(?:^|\s)reason=([^\s]+)/);
  const attempts=detail.match(/(?:^|\s)fail=(\d+)\/(\d+)(?=\s|$)/);
  model.rfidHistory.push({time_utc:row.time_utc,event:data.evt,outcome,uid,
    name:name?name[1]:null,reason:reason?reason[1]:null,attempt:attempts?Number(attempts[1]):null,
    attempt_limit:attempts?Number(attempts[2]):null,
    uptime_ms:Number.isFinite(data.uptime_ms)?data.uptime_ms:null,
    observed_session:model.state?model.state.session:null,session_source:'observed_state',
    event_session:data.session,session_verified:true});
  model.rfidHistory=model.rfidHistory.slice(-100);
  if(['accepted','denied','ignored'].includes(outcome)) {
    model.rfidCounts.total++; model.rfidCounts[outcome]++;
  }
}
function view(model, now) {
  const age=model.freshAt?now-model.freshAt:null;
  const connection=!model.broker?'broker_offline':!model.online?'device_offline':
    !model.state||age===null?'waiting_state':age>FRESHNESS_MS?'stale':'ready';
  return {state:model.state,age_ms:age,ready:connection==='ready',connection,
    broker_connected:model.broker,device_online:model.online,ack:model.ack||null,
    alerts:model.alerts,history:model.history,rule_history:model.ruleHistory,
    rfid_history:model.rfidHistory,rfid_counts:model.rfidCounts};
}
function saveRule(model, row) {
  model.ruleHistory.push(row);
  model.ruleHistory=model.ruleHistory.slice(-200);
  return row;
}
function ruleAlert(model, ruleId, kind, text, row) {
  const observedSession=model.state?model.state.session:null;
  model.alerts.push({time_utc:row.time_utc, rule_id:ruleId, kind, text,
    observed_session:observedSession,event_session:row.data.session,session_verified:true});
  model.alerts=model.alerts.slice(-50);
  return saveRule(model,{type:'rule', time_utc:row.time_utc, rule_id:ruleId,
    kind, outcome:'alert_created', source_event:row.data.evt,
    source_uptime_ms:Number.isFinite(row.data.uptime_ms)?row.data.uptime_ms:null,
    observed_session:observedSession, session_source:'observed_state',
    event_session:row.data.session,session_verified:true});
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
function ingest(model, topic, payload, retained, now, receiptKnown=false) {
  if(typeof topic!=='string' || !topic.startsWith(BASE+'/')) return {error:'topic'};
  const suffix=topic.slice(BASE.length+1);
  if (!['availability','state','event','ack','cmd','history','policy','policy_ack'].includes(suffix)) return {error:'topic'};
  let data;
  try { data=suffix==='availability'?String(payload):JSON.parse(String(payload)); }
  catch(e) { return {error:'invalid_json'}; }
  if(suffix==='availability' && !['online','offline'].includes(data)) return {error:'availability_schema'};
  if(suffix==='state' && (!data || !['LOCKED','UNLOCKED_WAIT_OPEN','DOOR_OPEN_AUTH','ALARM'].includes(data.state) || !/^[a-f0-9]{16}$/i.test(data.session||'') || !['OPEN','CLOSED'].includes(data.door))) return {error:'state_schema'};
  if(suffix==='state'&&data.policy_revision!==undefined&&(!Number.isSafeInteger(data.policy_revision)||data.policy_revision<0||typeof data.policy_ok!=='boolean'||typeof data.clock_synced!=='boolean'))return {error:'state_schema'};
  if(suffix==='event' && (!data || Array.isArray(data) || typeof data.evt!=='string' || !data.evt)) return {error:'event_schema'};
  if(suffix==='ack' && (!data || Array.isArray(data) || typeof data!=='object' || !['executed','rejected','expired'].includes(data.result))) return {error:'ack_schema'};
  const row={time_utc:new Date(now).toISOString(),topic,retained:!!retained,data};
  model.history.push(row); model.history=model.history.slice(-200);
  if(suffix==='policy'||suffix==='policy_ack'){
    let reason=retained?'retained':!model.state||!model.freshAt||now-model.freshAt>FRESHNESS_MS?'waiting_direct_state':data?.session!==model.state.session?'old_session':null;
    if(!reason){
      try{if(suffix==='policy'){require('./card_policy').normalize(data);if(typeof data.ok!=='boolean')throw Error();}
        else if(!Number.isSafeInteger(data.revision)||data.revision<0||!['saved','rejected'].includes(data.result))throw Error();}
      catch{reason='policy_schema';}
    }
    if(reason)row.ignored_reason=reason;
    else if(suffix==='policy')model.policy=data;else model.policyAck={...data,received_at:row.time_utc};
    return {row,request:null,rule:null};
  }
  if(suffix==='history') {
    const valid=require('./history_store').validEvent;
    const reason=retained?'retained':!valid(data)||data.replayed!==true?'history_schema':
      !model.state||!model.freshAt||now-model.freshAt>FRESHNESS_MS?'waiting_direct_state':
      data.session!==model.state.session?'old_session':null;
    if(reason)row.ignored_reason=reason;
    return {row,request:null,rule:null,archive:!reason};
  }
  if(suffix==='state' && !retained && model.state && data.session!==model.state.session &&
      (model.retiredSessions||[]).includes(data.session)) {
    row.ignored_reason='retired_session';return {row,request:null,rule:null};
  }
  // Week 8+ firmware tags every event/ACK. Preserve rejected rows for audit,
  // but never let a retained or different-session message affect live activity.
  if(suffix==='event' || suffix==='ack') {
    const reason=retained?'retained':
      !/^[a-f0-9]{16}$/i.test(data.session||'')?'session_missing_or_invalid':
      !model.state?'waiting_direct_state':
      data.session!==model.state.session?'old_session':null;
    if(reason) {row.ignored_reason=reason;return {row,request:null,rule:null};}
    if(suffix==='event'&&receiptKnown&&require('./history_store').validEvent(data)){
      row.ignored_reason='event_duplicate';return {row,request:null,rule:null};
    }
  }
  recordRfid(model,row);
  let request=null, rule=null;
  if(suffix==='availability') { model.online=data==='online'; if(!model.online) model.freshAt=0; }
  if(suffix==='state') {
    if(!retained) {
      if(!model.state || model.state.session!==data.session) {
        if(model.state)model.retiredSessions=[...(model.retiredSessions||[]),model.state.session].slice(-32);
        model.seq=0; model.alarm=false; model.leftOpen=false; model.ack=null;model.policy=null;model.policyAck=null;
      }
      // A direct state proves the device is live. An old retained availability
      // or a previous simulator's delayed will must not keep it offline forever.
      model.online=true; model.state=data; model.freshAt=now;
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
module.exports={BASE,FRESHNESS_MS,initial,ingest,command,recordRuleAction,view};
