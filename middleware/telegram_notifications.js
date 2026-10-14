const fs=require('node:fs'),path=require('node:path');
const CONFIG_FILE=path.join(__dirname,'telegram.local.json');
function loadConfig(file=CONFIG_FILE){
  try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
  catch(error){return {enabled:false,configError:error.code==='ENOENT'?'not_configured':'config_json'};}
}
function validToken(value){return typeof value==='string'&&/^\d{5,}:[a-zA-Z0-9_-]{20,}$/.test(value.trim());}
function validChat(value){return /^(?:[1-9]\d*)$/.test(String(value||''));}
function configProblem(config,requireChat=true){
  if(!config||typeof config!=='object'||Array.isArray(config))return 'config_json';
  if(config.configError)return config.configError;
  if(!validToken(config.botToken))return 'bot_token_missing_or_invalid';
  if(requireChat&&!validChat(config.chatId))return 'private_chat_id_missing_or_invalid';
  return null;
}
// Only the fixed official endpoint; never log the URL, token, chat ID or raw error.
async function callApi(config,method,body,{fetchImpl=fetch,signal}={}){
  if(!validToken(config.botToken))return {ok:false,reason:'bot_token_missing_or_invalid'};
  if(!['getMe','getUpdates','sendMessage'].includes(method))return {ok:false,reason:'method'};
  try{
    const response=await fetchImpl('https://api.telegram.org/bot'+config.botToken.trim()+'/'+method,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),redirect:'error'
    });
    const data=await response.json();
    if(!response.ok||data?.ok!==true)return {ok:false,reason:'telegram_'+(Number(data?.error_code)||response.status)};
    return {ok:true,result:data.result};
  }catch(error){return {ok:false,reason:signal?.aborted?'closed':'network_or_timeout'};}
}
function validRule(rule){
  return !!rule&&rule.type==='rule'&&rule.outcome==='alert_created'&&rule.session_verified===true&&
    /^[a-f0-9]{16}$/i.test(rule.event_session||'')&&rule.event_session===rule.observed_session&&
    Number.isFinite(rule.source_uptime_ms)&&rule.source_uptime_ms>=0&&Number.isFinite(Date.parse(rule.time_utc))&&
    ((rule.rule_id==='R1'&&rule.kind==='DOOR_FORCED'&&rule.source_event==='DOOR_FORCED')||
     (rule.rule_id==='R2'&&rule.kind==='LEFT_OPEN_WARN'&&rule.source_event==='LEFT_OPEN_WARN'));
}
function messageText(rule,config){
  const name=String(config.deviceName||'Nhóm 25 · Cửa 01').replace(/[\r\n\t]/g,' ').slice(0,80);
  const time=new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(rule.time_utc));
  return (rule.rule_id==='R1'?'🚨 R1 — Mở cửa trái phép':'⚠️ R2 — Nhắc đóng cửa')+'\n'+name+'\n'+
    (rule.rule_id==='R1'?'Đã phát hiện cửa mở khi chưa được cấp quyền. Kiểm tra cửa.':'Đã ghi nhận cửa mở hợp lệ quá 15 giây. Vui lòng đóng cửa.')+
    '\nGhi nhận: '+time+' (UTC+7)';
}
function createNotifier({readConfig=loadConfig,fetchImpl=fetch,now=Date.now,maxPending=16,maxAgeMs=60000}={}){
  const queue=[],seen=new Set(),controller=new AbortController();let running=false,closed=false;
  const row=(rule,outcome,reason=null)=>({type:'telegram_delivery',time_utc:new Date(now()).toISOString(),
    rule_id:rule?.rule_id||null,source_time_utc:rule?.time_utc||null,outcome,reason});
  function currentConfig(){try{return readConfig();}catch(error){return {enabled:false,configError:'config_json'};}}
  function eligible(rule){const age=now()-Date.parse(rule.time_utc);return age>=-5000&&age<=maxAgeMs;}
  async function drain(){
    if(running||closed)return;running=true;
    try{
      while(queue.length&&!closed){
        const job=queue.shift(),config=currentConfig();let result;
        if(config?.enabled!==true)result=row(job.rule,'disabled');
        else if(configProblem(config))result=row(job.rule,'failed',configProblem(config));
        else if(!eligible(job.rule))result=row(job.rule,'skipped','stale');
        else{
          const response=await callApi(config,'sendMessage',{chat_id:String(config.chatId),text:messageText(job.rule,config)},
            {fetchImpl,signal:controller.signal});
          result=closed?row(job.rule,'closed'):row(job.rule,response.ok?'api_accepted':'failed',response.ok?null:response.reason);
        }
        job.resolve(result);
      }
    }finally{running=false;}
  }
  function notify(rule){
    if(closed)return Promise.resolve(row(rule,'closed'));
    if(!validRule(rule))return Promise.resolve(row(rule,'skipped','invalid_rule'));
    const config=currentConfig();
    if(config?.enabled!==true)return Promise.resolve(row(rule,'disabled',config?.configError||null));
    if(configProblem(config))return Promise.resolve(row(rule,'failed',configProblem(config)));
    if(!eligible(rule))return Promise.resolve(row(rule,'skipped','stale'));
    const key=[rule.rule_id,rule.event_session,rule.source_uptime_ms,rule.time_utc].join('|');
    if(seen.has(key))return Promise.resolve(row(rule,'skipped','duplicate'));
    if(queue.length+(running?1:0)>=maxPending)return Promise.resolve(row(rule,'skipped','queue_full'));
    seen.add(key);if(seen.size>200)seen.delete(seen.values().next().value);
    return new Promise(resolve=>{queue.push({rule,resolve});void drain();});
  }
  function close(){closed=true;controller.abort();while(queue.length){const job=queue.shift();job.resolve(row(job.rule,'closed'));}}
  return {notify,close};
}
module.exports={CONFIG_FILE,loadConfig,configProblem,callApi,validRule,messageText,createNotifier};
