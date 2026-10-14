const telegram=require('./telegram_notifications');
const presentation=require('./event_presentation'),LABELS=presentation.LABELS;
function text(rows,config){
  const name=String(config.deviceName||'Nhóm 25 · Cửa 01').replace(/[\r\n\t]/g,' ').slice(0,80);
  const format=new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Bangkok'});
  return '📚 Lịch sử đồng bộ · '+name+'\nCác hoạt động trước đây vừa được nhận bổ sung. Thông tin này không mô tả cửa lúc này.\n\n'+rows.map(r=>{
    const time=r.event_time_utc?format.format(new Date(r.event_time_utc))+' UTC+7':'Sau khởi động '+(r.data.uptime_ms/1000).toFixed(1)+' giây · chưa có giờ thực';
    return '• '+time+' — '+presentation.title(r.data)+'\n'+presentation.detail(r.data)+'\n'+presentation.source(r);
  }).join('\n\n');
}
function createWorker({store,readConfig=telegram.loadConfig,fetchImpl=fetch,now=Date.now,onResult=()=>{}}){
  let active=false,closed=false,nextAttempt=0;const controller=new AbortController();
  async function tick(){
    if(active||closed||now()<nextAttempt)return;
    const config=readConfig();if(config?.enabled!==true||telegram.configProblem(config))return;
    const rows=store.pending().slice(0,8);if(!rows.length)return;
    active=true;
    try{
      const result=await telegram.callApi(config,'sendMessage',{chat_id:String(config.chatId),text:text(rows,config)},{fetchImpl,signal:controller.signal});
      if(closed)return;
      if(result.ok)store.complete(rows.map(r=>r.event_id));
      nextAttempt=now()+(result.ok?3000:60000);
      onResult({type:'history_telegram_delivery',time_utc:new Date(now()).toISOString(),event_ids:rows.map(r=>r.event_id),outcome:result.ok?'api_accepted':'failed',reason:result.ok?null:result.reason});
    }catch{nextAttempt=now()+60000;onResult({type:'history_telegram_delivery',time_utc:new Date(now()).toISOString(),outcome:'failed',reason:'history_storage_error'});}
    finally{active=false;}
  }
  return {tick,close(){closed=true;controller.abort();}};
}
module.exports={LABELS,text,createWorker};
