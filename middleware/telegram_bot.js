const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),telegram=require('./telegram_notifications'),core=require('./core');
const presentation=require('./event_presentation');
const FILE=path.resolve(__dirname,'../runtime/telegram_bot_state.json');
const clock=at=>new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(at))+' UTC+7';
function statusText(model,now){const d=core.view(model,now);const states={LOCKED:'đang khóa',UNLOCKED_WAIT_OPEN:'đã cấp quyền, chờ mở cửa',DOOR_OPEN_AUTH:'cửa mở hợp lệ',ALARM:'đang báo động'};
  return '📊 Trạng thái cửa\n'+(d.ready?'🟢 Thiết bị đang kết nối':'🔴 Chưa kết nối được thiết bị. Thông tin dưới đây là lần cập nhật gần nhất, có thể đã thay đổi.')+
    '\nKhóa: '+(states[d.state?.state]||'chưa có dữ liệu')+'\nCửa: '+(d.state?.door==='OPEN'?'mở':d.state?.door==='CLOSED'?'đóng':'chưa xác nhận')+
    '\nCập nhật: '+(d.age_ms===null?'chưa có thời gian xác nhận':Math.max(0,Math.round(d.age_ms/1000))+' giây trước')+'\nDùng thẻ: '+(d.ready?(d.state.lockout?'đang tạm ngưng, vui lòng chờ':'đang nhận thẻ'):'chưa xác nhận');}
function historyText(store){const rows=store.query({limit:8}).events;return '📚 Các hoạt động gần đây\n'+(rows.length?rows.map(r=>'• '+clock(Date.parse(r.event_time_utc||r.time_utc))+(r.event_time_utc?'':' (lúc nhận; chưa biết giờ xảy ra)')+'\n'+presentation.title(r.data)+'\n'+presentation.detail(r.data)+'\n'+presentation.source(r)).join('\n\n'):'Chưa có hoạt động được lưu.');}
function watch(state,ready,now,enabled,delay=30000){
  if(!enabled){state.seen=false;state.notified=false;state.lostAt=null;return null;}
  if(ready){const restore=state.notified;state.seen=true;state.lastReadyAt=now;state.notified=false;state.lostAt=null;return restore?{kind:'restored',at:now,text:'🟢 Thiết bị đã kết nối lại\nBạn có thể xem trạng thái cửa và điều khiển trên Web.\nGhi nhận lúc '+clock(now)}:null;}
  if(!state.seen)return null;
  if(state.lostAt===null)state.lostAt=now;
  if(!state.notified&&now-state.lostAt>=delay){state.notified=true;return {kind:'offline',at:now,text:'🔴 Không kết nối được thiết bị\nĐã hơn 30 giây không nhận được thông tin cửa. Bạn chưa thể điều khiển từ xa.\nKiểm tra mạng hoặc mô hình đang chạy. Lịch sử đã lưu sẽ được gửi khi kết nối lại.\nGhi nhận lúc '+clock(now)+'\nNếu bạn chủ động nghỉ, có thể tắt thông báo kết nối trên Web.'};}
  return null;
}
function createService({model,store,file=FILE,readConfig=telegram.loadConfig,fetchImpl=fetch,now=Date.now,onResult=()=>{}}){
  let state={offset:0,key:null,monitor_enabled:true,outbox:[],watch:{seen:false,notified:false,lostAt:null,lastReadyAt:null}},error=null,active=false,closed=false,nextPoll=0,nextNotification=0;
  const controller=new AbortController();
  if(fs.existsSync(file)){try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!Number.isSafeInteger(saved.offset)||saved.offset<0||typeof saved.monitor_enabled!=='boolean'||!Array.isArray(saved.outbox)||!saved.watch)throw Error();state=saved;}catch{error='bot_state_invalid';}}
  function save(){fs.mkdirSync(path.dirname(file),{recursive:true});const fd=fs.openSync(file+'.tmp','w');try{fs.writeFileSync(fd,JSON.stringify(state)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(file+'.tmp',file);}
  function view(){return {monitor_enabled:state.monitor_enabled,pending_notifications:state.outbox.length,error};}
  function setMonitor(enabled){if(typeof enabled!=='boolean')throw Error('monitor_schema');if(error)throw Error(error);state.monitor_enabled=enabled;watch(state.watch,false,now(),false);state.baseline_saved=false;state.outbox=[];save();return view();}
  async function send(config,text,keyboard=false){return telegram.callApi(config,'sendMessage',{chat_id:String(config.chatId),text,...(keyboard?{reply_markup:{keyboard:[['Trạng thái cửa','Lịch sử cửa'],['Hướng dẫn']],resize_keyboard:true}}:{})},{fetchImpl,signal:controller.signal});}
  async function tick(){
    if(active||closed||error)return;const config=readConfig();if(config?.enabled!==true||telegram.configProblem(config))return;
    active=true;
    try{
      const key=crypto.createHash('sha256').update(config.botToken.trim()+':'+config.chatId).digest('hex');
      if(state.key!==key){state.key=key;state.offset=0;state.outbox=[];state.baseline_saved=false;state.watch={seen:false,notified:false,lostAt:null,lastReadyAt:null};save();}
      const intent=watch(state.watch,core.view(model(),now()).ready,now(),state.monitor_enabled);
      if(intent){if(state.outbox.length<20)state.outbox.push(intent);save();}
      // Persist the online baseline once, so a restart cannot fabricate startup alarms.
      if(state.watch.seen&&!state.baseline_saved){state.baseline_saved=true;save();}
      if(now()>=nextPoll){
        nextPoll=now()+3000;
        const updates=await telegram.callApi(config,'getUpdates',{offset:state.offset,timeout:0,limit:20},{fetchImpl,signal:controller.signal});
        if(updates.ok){for(const update of updates.result||[]){
          if(closed)return;
          if(!Number.isSafeInteger(update.update_id)||update.update_id<state.offset)continue;
          const msg=update.message,allowed=msg?.chat?.type==='private'&&String(msg.chat.id)===String(config.chatId)&&String(msg.from?.id)===String(config.chatId)&&msg.from?.is_bot!==true;
          const age=now()/1000-Number(msg?.date),typed=typeof msg?.text==='string'?msg.text.trim():'',command=({'Trạng thái cửa':'/status','Lịch sử cửa':'/history','Hướng dẫn':'/help'}[typed]||typed.split(/\s/)[0].split('@')[0]).toLowerCase();
          if(allowed&&age>=-30&&age<=300&&command.startsWith('/')){
            const text=command==='/status'?statusText(model(),now()):command==='/history'?historyText(store):
              '🔐 Khóa cửa RFID · Nhóm 25\nBấm các nút bên dưới để xem cửa đang thế nào hoặc các hoạt động gần đây.\n\nBạn cũng có thể gõ:\n/status — trạng thái cửa\n/history — lịch sử cửa\n/help — hướng dẫn\n\nBot sẽ báo khi cửa bị mở trái phép, để mở quá lâu hoặc mất kết nối. Hoạt động lúc mất mạng sẽ được báo bổ sung sau.\nMuốn mở khóa, hãy dùng Web, nhập mã điều khiển và xác nhận.';
            const result=await send(config,text,true);onResult({type:'telegram_bot_reply',time_utc:new Date(now()).toISOString(),command,outcome:result.ok?'api_accepted':'failed',reason:result.ok?null:result.reason});
          }
          state.offset=update.update_id+1;save();
        }}
      }
      if(!closed&&state.outbox.length&&now()>=nextNotification){const item=state.outbox[0],result=await send(config,item.text);if(result.ok){state.outbox.shift();save();}nextNotification=now()+(result.ok?3000:60000);onResult({type:'connection_telegram_delivery',time_utc:new Date(now()).toISOString(),kind:item.kind,outcome:result.ok?'api_accepted':'failed',reason:result.ok?null:result.reason});}
    }catch{onResult({type:'telegram_bot_error',time_utc:new Date(now()).toISOString(),reason:'bot_network_or_storage'});nextPoll=now()+60000;}
    finally{active=false;}
  }
  return {tick,view,setMonitor,close(){closed=true;controller.abort();}};
}
module.exports={FILE,statusText,historyText,watch,createService};
