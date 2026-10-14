const fs=require('node:fs'),path=require('node:path');
const FILE=path.resolve(__dirname,'../runtime/event_journal.jsonl');
const EVENTS=new Set(['UNLOCK_GRANTED','CARD_DENIED','CARD_IGNORED_LOCKOUT','LOCKOUT_START','LOCKOUT_END','DOOR_FORCED','DOOR_OPENED','DOOR_REOPENED','DOOR_CLOSED','RELOCKED','LEFT_OPEN_WARN','ALARM_MUTED','ALARM_CLEARED','CMD_UNKNOWN','BOOT_DOOR_OPEN']);
function validEvent(d){
  return !!d&&EVENTS.has(d.evt)&&['LOCKED','UNLOCKED_WAIT_OPEN','DOOR_OPEN_AUTH','ALARM'].includes(d.state)&&
    /^[a-f0-9]{16}$/i.test(d.boot_id||'')&&new RegExp('^'+d.boot_id+'-[a-f0-9]{8}$','i').test(d.event_id||'')&&
    Number.isInteger(d.uptime_ms)&&d.uptime_ms>=0&&d.uptime_ms<=0xffffffff&&
    typeof d.offline==='boolean'&&typeof d.replayed==='boolean'&&typeof d.detail==='string'&&d.detail.length<=160&&
    (d.event_time_ms===undefined||(Number.isSafeInteger(d.event_time_ms)&&d.event_time_ms>=1704067200000&&d.event_time_ms<=Date.now()+300000));
}
function createStore({file=FILE,fsImpl=fs}={}){
  const records=new Map(),done=new Set();let healthy=true;
  function apply(row){if(row.type==='stored_event'&&!records.has(row.event_id))records.set(row.event_id,row);else if(row.type==='history_telegram_done'&&typeof row.event_id==='string')done.add(row.event_id);}
  fsImpl.mkdirSync(path.dirname(file),{recursive:true});
  if(fsImpl.existsSync(file)){
    // An interrupted append can leave a partial trailing line. Repair only
    // that final fragment; interior corruption fails closed (no device ACK).
    const data=fsImpl.readFileSync(file),last=data.lastIndexOf(10),complete=last<0?Buffer.alloc(0):data.subarray(0,last+1);
    if(complete.length!==data.length)fsImpl.truncateSync(file,complete.length);
    for(const line of complete.toString('utf8').split('\n').filter(Boolean)){
      try{const row=JSON.parse(line);if(row.type==='stored_event'&&!validEvent(row.data))throw Error('schema');apply(row);}
      catch{healthy=false;}
    }
  }
  function append(row){
    if(!healthy)throw Error('history_store_corrupt');
    const fd=fsImpl.openSync(file,'a');
    try{fsImpl.writeFileSync(fd,JSON.stringify(row)+'\n');fsImpl.fsyncSync(fd);}
    catch(error){healthy=false;throw Error('history_write_failed');}
    finally{fsImpl.closeSync(fd);}
    apply(row);
  }
  function accept(data,receivedAt,historical){
    if(!healthy||!validEvent(data))throw Error('history_store_invalid');
    const existing=records.get(data.event_id);
    if(existing){
      for(const key of ['evt','state','detail','uptime_ms','boot_id','offline','event_time_ms'])
        if(existing.data[key]!==data[key])throw Error('history_id_conflict');
      return {row:existing,duplicate:true};
    }
    const row={type:'stored_event',event_id:data.event_id,time_utc:new Date(receivedAt).toISOString(),
      event_time_utc:data.event_time_ms?new Date(data.event_time_ms).toISOString():null,
      historical:!!historical,data:{...data}};
    append(row);return {row,duplicate:false};
  }
  return {accept,has:id=>records.has(id),view:()=>({ok:healthy,total:records.size,events:[...records.values()].slice(-300)}),
    pending:()=>[...records.values()].filter(r=>r.historical&&!done.has(r.event_id)),
    complete:ids=>{for(const id of ids)if(records.has(id)&&!done.has(id))append({type:'history_telegram_done',event_id:id,time_utc:new Date().toISOString()});}};
}
// Lazy singleton: importing modules/tests does not create production files.
let shared;
function getStore(){return shared||(shared=createStore());}
module.exports={FILE,EVENTS,validEvent,createStore,getStore};
