const telegram=require('./telegram_notifications');
const LABELS={UNLOCK_GRANTED:'Cấp quyền mở khóa',CARD_DENIED:'Thẻ bị từ chối',CARD_IGNORED_LOCKOUT:'Thẻ bị bỏ qua khi khóa tạm',LOCKOUT_START:'Bắt đầu khóa tạm RFID',LOCKOUT_END:'Kết thúc khóa tạm RFID',DOOR_FORCED:'🚨 R1 · Mở cửa trái phép',DOOR_OPENED:'Cửa mở hợp lệ',DOOR_REOPENED:'Cửa mở lại',DOOR_CLOSED:'Cửa đã đóng',RELOCKED:'Khóa lại',LEFT_OPEN_WARN:'⚠️ R2 · Cửa mở hợp lệ quá lâu',ALARM_MUTED:'Còi kết thúc thời gian phát',ALARM_CLEARED:'Báo động đã phục hồi',CMD_UNKNOWN:'Lệnh local không hỗ trợ',BOOT_DOOR_OPEN:'Cửa mở khi thiết bị khởi động'};
function text(rows,config){
  const name=String(config.deviceName||'Nhóm 25 · Cửa 01').replace(/[\r\n\t]/g,' ').slice(0,80);
  const format=new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Bangkok'});
  return '📚 Lịch sử đồng bộ · '+name+'\nSự kiện đã xảy ra khi mất kết nối hoặc chưa được xác nhận. Đây không phải trạng thái cửa hiện tại.\n\n'+rows.map(r=>{
    const time=r.event_time_utc?format.format(new Date(r.event_time_utc))+' UTC+7':'Sau khởi động '+(r.data.uptime_ms/1000).toFixed(1)+'s · chưa có giờ thực';
    return '• '+time+' — '+(LABELS[r.data.evt]||r.data.evt)+(r.data.offline?' [Offline]':' [Gửi bù]')+'\n'+r.data.detail.replace(/[\r\n\t]/g,' ').slice(0,160)+'\nID '+r.event_id;
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
