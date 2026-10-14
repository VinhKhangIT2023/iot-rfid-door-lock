const fs=require('node:fs'),path=require('node:path'),t=require('./telegram_notifications');
async function main(){
  const action=process.argv[2]||'init';
  if(action==='init'){
    if(!fs.existsSync(t.CONFIG_FILE))fs.copyFileSync(path.join(__dirname,'telegram.example.json'),t.CONFIG_FILE);
    console.log('Cấu hình riêng: '+t.CONFIG_FILE+' (Git bỏ qua). Điền botToken, giữ enabled=false khi chuẩn bị.');return;
  }
  const config=t.loadConfig(),problem=t.configProblem(config,action!=='chats');
  if(problem)throw Error(problem);
  if(action==='chats'){
    const me=await t.callApi(config,'getMe',{});if(!me.ok)throw Error(me.reason);
    console.log('Bot: @'+me.result.username);
    const updates=await t.callApi(config,'getUpdates',{timeout:0,limit:100});if(!updates.ok)throw Error(updates.reason);
    const chats=new Map();for(const update of updates.result||[]){const chat=update.message?.chat;if(chat?.type==='private')chats.set(String(chat.id),chat);}
    if(!chats.size){console.log('Chưa thấy chat riêng. Mở đúng bot, bấm Start hoặc gửi /start, rồi chạy lại.');return;}
    for(const [id,chat] of chats)console.log('Chat ID: '+id+' · '+(chat.username?'@'+chat.username:(chat.first_name||'Chat riêng')));
    console.log('Chọn Chat ID của chính bạn, điền chatId dạng chuỗi trong telegram.local.json. Không tự chọn người nhận.');return;
  }
  if(action==='test'){
    if(config.enabled!==true)throw Error('enabled_is_false');
    const result=await t.callApi(config,'sendMessage',{chat_id:String(config.chatId),text:'✅ Thông báo thử — Nhóm 25\nKênh Telegram nhận cảnh báo R1/R2 đã kết nối. Tin thử này không điều khiển cửa.'});
    if(!result.ok)throw Error(result.reason);
    console.log('Telegram API đã nhận tin thử. Kiểm tra cuộc trò chuyện trên điện thoại.');return;
  }
  throw Error('Dùng init, chats hoặc test');
}
main().catch(error=>{console.error('Telegram setup: '+error.message);process.exitCode=1;});
