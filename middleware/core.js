// Pure logic shared by Node-RED functions and offline tests.
const BASE = 'iot/nhom25/door8/w4-927-a61c';
function initial() { return {online:false, broker:false, state:null, freshAt:0, seq:0, alerts:[], history:[], alarm:false}; }
function ingest(model, topic, payload, retained, now) {
  const suffix=topic.slice(BASE.length+1);
  let data;
  try { data=suffix==='availability'?String(payload):JSON.parse(String(payload)); }
  catch(e) { return {error:'invalid_json'}; }
  if (!['availability','state','event','ack','cmd'].includes(suffix)) return {error:'topic'};
  const row={time_utc:new Date(now).toISOString(),topic,retained:!!retained,data};
  model.history.push(row); model.history=model.history.slice(-200);
  let request=null;
  if(suffix==='availability') { model.online=data==='online'; if(!model.online) model.freshAt=0; }
  if(suffix==='state') {
    if(!data || !['LOCKED','UNLOCKED_WAIT_OPEN','DOOR_OPEN_AUTH','ALARM'].includes(data.state) || !/^[a-f0-9]{16}$/i.test(data.session||'') || !['OPEN','CLOSED'].includes(data.door)) return {error:'state_schema'};
    if(!retained) {
      if(!model.state || model.state.session!==data.session) model.seq=0;
      model.state=data; model.freshAt=now;
      if(data.state!=='ALARM') model.alarm=false;
    }
  }
  if(suffix==='cmd' && data && model.state && data.session===model.state.session && Number.isInteger(data.seq)) model.seq=Math.max(model.seq,data.seq);
  if(suffix==='ack') model.ack={...data,received_at:row.time_utc};
  // One rule: forced opening creates an alert and requests status; never auto-unlocks.
  if(suffix==='event' && !retained && data && data.evt==='DOOR_FORCED' && !model.alarm) {
    model.alarm=true;
    const alert={time_utc:row.time_utc,kind:'DOOR_FORCED',text:'Cửa mở khi chưa được cấp quyền'};
    model.alerts.push(alert); model.alerts=model.alerts.slice(-50);
    request={action:'status',source:'rule-door-forced'};
  }
  return {row,request};
}
function command(model, action, now) {
  if(!['unlock','status'].includes(action)) return {error:'action'};
  if(!model.broker || !model.online || !model.state || now-model.freshAt>12000) return {error:'offline_or_stale'};
  // Epoch seconds make a restarted controller less likely to reuse a sequence.
  // Observed cmd messages also raise the counter. Still use one controller.
  model.seq=Math.max(model.seq+1,Math.floor(now/1000));
  return {topic:BASE+'/cmd',payload:JSON.stringify({session:model.state.session,seq:model.seq,action}),qos:1,retain:false};
}
module.exports={BASE,initial,ingest,command};
