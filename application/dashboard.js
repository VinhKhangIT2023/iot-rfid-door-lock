'use strict';
const el=id=>document.getElementById(id);
let ready=false, sending=false, refreshing=false, latest=null, pending=null;
const pages=['overview','rfid','journal','cards','technical'];
let journalResult=null,journalPage=0,journalController=null,journalRequest=0,editingUid=null,cardDraft=null,cardSubmitting=false,monitorDirty=false,cardListKey='';
const timeFormat=new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Bangkok'});
const dateFormat=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Bangkok'});
const stateLabels={
  LOCKED:['Cửa đang khóa','Khóa đã đóng. Thiết bị chờ thẻ hợp lệ hoặc lệnh mở khóa.','locked','ĐANG KHÓA'],
  UNLOCKED_WAIT_OPEN:['Đã cấp quyền','Khóa đã mở, đang chờ mở cửa trong thời gian cho phép.','unlocked','CHỜ MỞ CỬA'],
  DOOR_OPEN_AUTH:['Cửa đang mở','Cửa được mở hợp lệ. Đóng cửa để hệ thống tự khóa lại.','open','MỞ CỬA HỢP LỆ'],
  ALARM:['Đang báo động','Thiết bị phát hiện cửa mở khi chưa được cấp quyền.','alarm','MỞ CỬA TRÁI PHÉP']
};
const outcomeLabels={
  accepted:['Được cấp quyền','success','mint','check'],
  denied:['Bị từ chối','danger','red','alert'],
  ignored:['Bỏ qua khi khóa tạm','warning','amber','card'],
  lockout_start:['Bắt đầu khóa tạm','warning','amber','lock'],
  lockout_end:['Kết thúc khóa tạm','neutral','blue','card']
};
function stamp(value,withDate=false){
  const d=new Date(value);return Number.isNaN(d.getTime())?'—':(withDate?dateFormat.format(d)+' · ':'')+timeFormat.format(d);
}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function icon(name,color){
  const tile=node('span',undefined,'icon-tile '+color);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);tile.append(svg);return tile;
}
function pill(text,tone){return node('span',text,'pill '+tone);}
function empty(container,title,description,iconName='card'){
  const block=node('div',undefined,'empty-state');block.append(icon(iconName,'blue'),node('b',title),node('p',description));container.append(block);
}
function selectPage(name,focus=false){
  if(!pages.includes(name))return;
  window.scrollTo(0,0);
  for(const page of pages){const active=page===name;el('page-'+page).hidden=!active;const tab=el('tab-'+page);tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  el('page-label').textContent={overview:'Tổng quan',rfid:'Hoạt động RFID',journal:'Lịch sử cửa',cards:'Quản lý thẻ',technical:'Thông tin kỹ thuật'}[name];
  if(focus)el('tab-'+name).focus();if(name==='journal')refreshJournal();
}
function lockButtons(){
  for(const action of ['status','unlock'])el(action).disabled=!ready||!el('token').value.trim()||sending||!!pending;
  el('confirm-unlock').disabled=!ready||!el('token').value.trim()||sending||!!pending;
}
function notice(text,tone=''){el('notice').textContent=text;el('notice').className='command-notice'+(tone?' '+tone:'');}
function renderConnection(d){
  ready=!!d.ready;
  if(pending && d.state?.session && d.state.session!==pending.session) {
    pending=null;
    notice('Phiên thiết bị đã thay đổi. Kiểm tra trạng thái trước khi gửi lại lệnh.','error');
  }
  const status={
    ready:['Thiết bị trực tuyến','success','Online','Đang nhận trạng thái mới'],
    broker_offline:['Chưa kết nối MQTT','neutral','Mất kết nối MQTT','Đang chờ middleware nối broker'],
    device_offline:['Chờ thiết bị','neutral','Chưa trực tuyến','Thiết bị offline hoặc chưa thông báo online'],
    waiting_state:['Chờ dữ liệu thiết bị','warning','Chờ dữ liệu','Chưa nhận trạng thái trực tiếp'],
    stale:['Dữ liệu đã cũ','warning','Dữ liệu đã cũ','Cần trạng thái mới trước khi gửi lệnh'],
    app_offline:['Mất kết nối ứng dụng','danger','Mất kết nối Web','Không đọc được dữ liệu từ middleware']
  }[d.connection]||['Chưa sẵn sàng','neutral','Chưa sẵn sàng','Chờ trạng thái trực tiếp'];
  el('connection').className='pill '+status[1];el('connection').replaceChildren(node('span',undefined,'status-dot'),document.createTextNode(status[0]));
  el('online').textContent=status[2];el('connection-detail').textContent=status[3];
  const hasState=!!d.state;
  el('connection-warning').hidden=ready||!hasState;
  el('connection-warning').textContent='Thiết bị chưa sẵn sàng. Trạng thái cửa dưới đây là dữ liệu gần nhất, có thể đã cũ; điều khiển từ xa đang bị chặn.';
  const state=stateLabels[d.state?.state];
  el('hero-title').textContent=state?state[0]:'Chờ thiết bị';
  el('hero-description').textContent=state?state[1]:'Bật mô hình Wokwi để nhận trạng thái trực tiếp của cửa.';
  el('door-hero').dataset.state=state?state[2]:'unknown';
  el('door-hero').classList.toggle('is-stale',!ready);
  el('door-hero').classList.toggle('is-open',d.state?.door==='OPEN');
  el('hero-tag').textContent=hasState&&!ready?'DỮ LIỆU GẦN NHẤT · CHƯA XÁC NHẬN':state?state[3]:'CHƯA CÓ DỮ LIỆU';
  el('fresh').textContent=d.age_ms===null||d.age_ms===undefined?'Chưa có trạng thái trực tiếp còn hiệu lực':'Nhận state '+Math.max(0,Math.round(d.age_ms/1000))+' giây trước · '+(ready?'dữ liệu mới':'đã cũ');
  el('door').textContent=d.state?.door==='OPEN'?'Đang mở':d.state?.door==='CLOSED'?'Đã đóng':'Chưa xác nhận';
  el('door-detail').textContent=hasState?(ready?'Cảm biến trực tiếp từ ESP32':'Dữ liệu gần nhất · chưa xác nhận'):'Chờ dữ liệu từ ESP32';
  const known=ready&&typeof d.state?.lockout==='boolean';
  const lockout=known&&d.state.lockout;
  const rfidText=known?(lockout?'Đang khóa tạm':'Không khóa tạm'):'Chưa xác nhận';
  el('rfid-state').textContent=rfidText;
  el('rfid-state-detail').textContent=known?(lockout?'Thiết bị tạm bỏ qua thẻ RFID':'Xác thực thẻ tại ESP32'):'Cần trạng thái trực tiếp còn mới';
  for(const id of ['rfid-live']){el(id).textContent=rfidText;el(id).className='pill '+(known?(lockout?'warning':'success'):'neutral');}
  el('session').textContent=d.state?.session||'—';el('state').textContent=d.state?.state||'—';
  el('uptime').textContent=Number.isFinite(d.state?.uptime_ms)?(d.state.uptime_ms/1000).toFixed(1)+' giây':'—';
  lockButtons();
}
function rfidDetail(entry){
  if(entry.outcome==='accepted')return 'ESP32 đã cấp quyền qua RFID.';
  if(entry.outcome==='denied'&&entry.reason&&entry.reason!=='not_registered')return ({disabled:'Thẻ đã bị tắt quyền.',outside_schedule:'Ngoài ngày/khung giờ được phép.',expired:'Quyền thẻ đã hết hạn.',not_yet_valid:'Thẻ chưa tới ngày có hiệu lực.',clock_unavailable:'Thiết bị chưa đồng bộ giờ để kiểm tra quyền.',policy_unavailable:'Cấu hình quyền chưa sẵn sàng.'}[entry.reason]||entry.reason);
  if(entry.outcome==='denied')return entry.attempt!==null?'Thẻ không hợp lệ · lần sai '+entry.attempt+'/'+entry.attempt_limit:'Thẻ không thuộc danh sách hợp lệ.';
  if(entry.outcome==='ignored')return 'Thiết bị đang khóa tạm xác thực RFID.';
  return entry.outcome==='lockout_start'?'Quét sai quá giới hạn; xem trạng thái khóa tạm hiện tại.':'Thiết bị đã kết thúc đợt khóa tạm.';
}
function formatUid(uid){return uid?uid.match(/.{1,2}/g).join(':'):'—';}
function renderRfid(d){
  const rows=Array.isArray(d.rfid_history)?d.rfid_history:[];
  const counts=d.rfid_counts||{};
  for(const key of ['total','accepted','denied','ignored'])el('count-'+key).textContent=String(counts[key]||0);
  const recent=el('rfid-recent');recent.replaceChildren();
  for(const row of rows.slice(-3).reverse()){
    const label=outcomeLabels[row.outcome];if(!label)continue;
    const item=node('div',undefined,'event-item'),copy=node('div',undefined,'event-copy'),time=node('time',stamp(row.time_utc),'event-time');
    time.dateTime=row.time_utc;time.title=stamp(row.time_utc,true)+' (UTC+7)';
    copy.append(node('b',row.name?'Thẻ '+row.name:row.uid?'Thẻ '+formatUid(row.uid):label[0]),node('p',row.uid?formatUid(row.uid):rfidDetail(row)),pill(label[0],label[1]));
    item.append(icon(label[3],label[2]),copy,time);recent.append(item);
  }
  if(!rows.length)empty(recent,'Chưa ghi nhận lượt quét','Quét thẻ trên đầu đọc Wokwi để theo dõi kết quả tại đây.');
  renderRfidTable(rows);
}
function renderRfidTable(rows=latest?.rfid_history||[]){
  const filter=el('rfid-filter').value,query=el('rfid-search').value.trim().toLowerCase();
  const uidQuery=query.replace(/[:\s]/g,'');
  const matches=rows.filter(row=>outcomeLabels[row.outcome]&&(filter==='all'||(filter==='lockout'?row.outcome.startsWith('lockout_'):row.outcome===filter))&&(!query||(row.name||'').toLowerCase().includes(query)||(!!uidQuery&&(row.uid||'').toLowerCase().includes(uidQuery))));
  const tbody=el('rfid-history');tbody.replaceChildren();
  for(const row of matches.slice().reverse()){
    const label=outcomeLabels[row.outcome],tr=node('tr'),when=node('td'),card=node('td'),result=node('td');
    when.append(node('span',stamp(row.time_utc)),node('small',dateFormat.format(new Date(row.time_utc))+' · UTC+7'));
    card.append(node('b',row.name?'Thẻ '+row.name:row.uid?'Thẻ RFID':'Hệ thống RFID'),node('small',formatUid(row.uid)));
    result.append(pill(label[0],label[1]));tr.append(when,card,result,node('td',rfidDetail(row)));tbody.append(tr);
  }
  el('rfid-empty').hidden=matches.length>0;
  el('rfid-empty').textContent=rows.length?'Không có hoạt động khớp bộ lọc.':'Chưa có sự kiện RFID. Quét thẻ trên đầu đọc Wokwi để bắt đầu.';
}
function renderAlerts(d){
  const alerts=Array.isArray(d.alerts)?d.alerts:[],container=el('alerts');container.replaceChildren();el('alert-count').textContent=String(alerts.length);
  for(const a of alerts.slice(-3).reverse()){
    const reminder=a.kind==='LEFT_OPEN_WARN',item=node('div',undefined,'event-item'),copy=node('div',undefined,'event-copy'),time=node('time',stamp(a.time_utc),'event-time');time.dateTime=a.time_utc;time.title=stamp(a.time_utc,true)+' (UTC+7)';
    copy.append(node('b',reminder?'Nhắc đóng cửa · R2':'Mở cửa trái phép · R1'),node('p',a.text));
    item.append(icon('alert',reminder?'amber':'red'),copy,time);container.append(item);
  }
  if(!alerts.length)empty(container,'Chưa có cảnh báo','Các cảnh báo từ thiết bị sẽ xuất hiện tại đây.','check');
  const body=el('rules'),rules=d.rule_history||[];body.replaceChildren();
  for(const row of rules.slice(-20).reverse()){
    const tr=node('tr');
    const result=row.outcome==='alert_created'?'Đã tạo cảnh báo':row.outcome==='sent'?'Đã gửi status · seq '+row.sequence:'Chưa gửi: thiết bị chưa sẵn sàng ('+row.reason+')';
    tr.append(node('td',stamp(row.time_utc,true)),node('td',row.rule_id+' · '+(row.kind==='LEFT_OPEN_WARN'?'Mở cửa lâu':'Mở trái phép')),node('td',result));body.append(tr);
  }
  el('rules-empty').hidden=rules.length>0;
}
function renderAck(d){
  const ack=d.ack;
  el('ack').textContent=ack?JSON.stringify(ack,null,2):'Chưa có ACK';
  const labels={executed:'Thiết bị đã xử lý lệnh',rejected:'Thiết bị từ chối lệnh',expired:'Lệnh đã hết hạn'};
  el('ack-summary').textContent=ack?(labels[ack.result]||'Đã nhận phản hồi thiết bị')+(ack.seq!==undefined?' · seq '+ack.seq:''):'Chưa có phản hồi từ thiết bị';
  el('ack-time').textContent=ack?.received_at?stamp(ack.received_at,true)+' · UTC+7':'';
  if(pending&&ack?.seq===pending.seq&&ack?.session===pending.session&&d.state?.session===pending.session){
    notice(ack.result==='executed'?'Thiết bị đã xử lý lệnh '+(pending.action==='unlock'?'mở khóa':'đọc trạng thái')+'.':labels[ack.result]||'Thiết bị trả phản hồi chưa xác định.',ack.result==='executed'?'success':'error');pending=null;
  }else if(pending&&Date.now()-pending.started>20000){notice('Chưa nhận ACK khớp lệnh đã gửi. Kiểm tra thiết bị; hệ thống không tự gửi lại.','error');pending=null;}
  lockButtons();
}
function renderHistory(d){
  const history=d.history||[],tbody=el('history');tbody.replaceChildren();
  for(const row of history.slice(-20).reverse()){
    const tr=node('tr'),kind=node('td',row.topic.split('/').pop());
    if(row.retained)kind.append(node('small','retained','row-retained'));
    if(row.ignored_reason)kind.append(node('small','Bỏ qua: '+row.ignored_reason,'row-retained'));
    tr.append(node('td',stamp(row.time_utc,true)),kind,node('td',JSON.stringify(row.data)));tbody.append(tr);
  }
  el('history-empty').hidden=history.length>0;
}
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{
    const response=await fetch('/api/door',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('http');
    const d=await response.json();latest=d;
    renderConnection(d);renderRfid(d);renderAlerts(d);renderAck(d);renderHistory(d);renderJournal(d);renderCards(d);renderMonitor(d);if(!el('page-journal').hidden)refreshJournal();
    el('updated').textContent='Cập nhật '+stamp(new Date().toISOString())+' · UTC+7';
  }catch(error){
    renderConnection({...latest,ready:false,connection:'app_offline',age_ms:null});
    el('updated').textContent='Chưa kết nối ứng dụng';
  }finally{refreshing=false;}
}
const journalLabels={UNLOCK_GRANTED:'Cấp quyền mở khóa',CARD_DENIED:'Thẻ bị từ chối',CARD_IGNORED_LOCKOUT:'Thẻ bị bỏ qua',LOCKOUT_START:'Bắt đầu khóa tạm',LOCKOUT_END:'Kết thúc khóa tạm',DOOR_FORCED:'R1 · Mở trái phép',DOOR_OPENED:'Cửa mở hợp lệ',DOOR_REOPENED:'Cửa mở lại',DOOR_CLOSED:'Đóng cửa',RELOCKED:'Khóa lại',LEFT_OPEN_WARN:'R2 · Nhắc đóng cửa',ALARM_MUTED:'Còi ngừng phát',ALARM_CLEARED:'Phục hồi báo động',POLICY_APPLIED:'Đã áp dụng quyền thẻ',BOOT_DOOR_OPEN:'Cửa mở lúc khởi động',CMD_UNKNOWN:'Lệnh local không hỗ trợ'};
function renderJournal(d=latest||{}){
  const journal=d.event_journal||{},rows=journalResult?.events||journal.events||[],query=el('journal-search').value.trim().toLowerCase(),filter=el('journal-filter').value;
  const matches=journalResult?rows:rows.filter(r=>(filter==='all'||journalSource(r)===filter)&&(!query||(r.data.evt+' '+r.data.detail).toLowerCase().includes(query)));
  el('journal-filter-help').textContent={all:'Các nhóm nguồn không trùng nhau: Offline, gửi lại khi Online hoặc trực tiếp.',offline:'Chỉ sự kiện xảy ra khi thiết bị mất Wi-Fi/MQTT. Được đồng bộ sau khi kết nối lại.',retry:'Chỉ sự kiện xảy ra lúc có mạng nhưng được gửi lại vì chưa nhận xác nhận lưu. Không gồm sự kiện Offline.',live:'Sự kiện gửi trực tiếp và được xác nhận, không phải dữ liệu gửi bù.'}[filter];
  el('journal-status').textContent=journal.ok===false?'Nhật ký middleware lỗi; thiết bị chưa được xác nhận để xóa sự kiện.':
    'Đã lưu '+(journal.total||0)+' sự kiện. '+(d.ready&&Number.isInteger(d.state?.journal_pending)?'Thiết bị còn '+d.state.journal_pending+' sự kiện chờ đồng bộ; bộ nhớ bền vững '+d.state.journal_capacity+' sự kiện. '+(d.state.journal_ok===false?'Bộ nhớ thiết bị đang báo lỗi.':''):'Chờ trạng thái trực tiếp để xác nhận hàng đợi thiết bị.');
  const body=el('journal-history');body.replaceChildren();
  for(const r of (journalResult?matches:matches.slice().reverse())){
    const tr=node('tr'),when=node('td'),what=node('td'),source=node('td'),detail=node('td');
    when.append(node('span',r.event_time_utc?stamp(r.event_time_utc,true):'Sau khởi động '+(r.data.uptime_ms/1000).toFixed(1)+'s'),node('small',r.event_time_utc?'Giờ thiết bị · UTC+7':'Chưa đồng bộ giờ · boot '+r.data.boot_id),node('small','Nhận '+stamp(r.time_utc,true)));
    what.append(node('b',journalLabels[r.data.evt]||r.data.evt));
    source.append(pill({offline:'Offline',retry:'Gửi lại khi Online',live:'Trực tiếp'}[journalSource(r)],journalSource(r)==='live'?'success':'warning'));
    detail.append(node('span',r.data.detail||'—'),node('small','ID '+r.event_id));tr.append(when,what,source,detail);body.append(tr);
  }
  el('journal-empty').hidden=matches.length>0;el('journal-empty').textContent=journal.total?'Không có sự kiện khớp bộ lọc.':'Chưa có sự kiện được lưu.';
  const total=journalResult?.total||0,limit=journalResult?.limit||50;el('journal-range').textContent=total?((journalPage*limit+1)+'–'+Math.min((journalPage+1)*limit,total)+' / '+total):'0 sự kiện';el('journal-prev').disabled=journalPage===0;el('journal-next').disabled=!journalResult?.has_more;el('journal-export').href='/api/history.csv?'+journalFilters();
}
async function send(action){
  if(pending){notice('Đang chờ phản hồi cho lệnh trước.');return;}
  if(!ready||sending||!el('token').value.trim()){notice('Cần mã điều khiển và trạng thái thiết bị mới.','error');return;}
  sending=true;lockButtons();notice('Đang gửi lệnh…');
  try{
    const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+el('token').value.trim()},body:JSON.stringify({action}),signal:AbortSignal.timeout(6000)});
    const result=await response.json();
    if(response.ok){pending={seq:result.seq,session:result.session,action,started:Date.now()};notice('Đã gửi lệnh · seq '+result.seq+'. Đang chờ phản hồi thiết bị.');}
    else{const message={forbidden:'Mã điều khiển không đúng.',offline_or_stale:'Thiết bị offline hoặc dữ liệu đã cũ.',action:'Lệnh không được hỗ trợ.'}[result.error]||'Ứng dụng chưa gửi được lệnh.';notice(message,'error');}
  }catch(error){notice('Chưa xác nhận được kết quả gửi lệnh. Kiểm tra kết nối trước khi thử lại.','error');}
  finally{sending=false;lockButtons();refresh();}
}
for(const [index,page] of pages.entries()){
  const tab=el('tab-'+page);tab.onclick=()=>selectPage(page);
  tab.addEventListener('keydown',event=>{
    const target=event.key==='ArrowRight'?(index+1)%pages.length:event.key==='ArrowLeft'?(index+pages.length-1)%pages.length:event.key==='Home'?0:event.key==='End'?pages.length-1:null;
    if(target!==null){event.preventDefault();selectPage(pages[target],true);}
  });
}
el('show-rfid').onclick=()=>selectPage('rfid',true);
el('rfid-search').addEventListener('input',()=>renderRfidTable());
el('rfid-filter').addEventListener('change',()=>renderRfidTable());
el('journal-search').addEventListener('input',resetJournalPage);
el('journal-filter').addEventListener('change',resetJournalPage);
el('journal-from').addEventListener('change',resetJournalPage);el('journal-to').addEventListener('change',resetJournalPage);
el('journal-prev').onclick=()=>{journalPage=Math.max(0,journalPage-1);refreshJournal();};el('journal-next').onclick=()=>{journalPage++;refreshJournal();};
el('token').addEventListener('input',()=>{el('cards-token').value=el('token').value;lockButtons();renderCards(latest||{});});
el('status').onclick=()=>send('status');
el('unlock').onclick=()=>el('unlock-dialog').showModal();
el('cancel-unlock').onclick=()=>el('unlock-dialog').close();
el('confirm-unlock').onclick=()=>{el('unlock-dialog').close();send('unlock');};
el('today').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Bangkok'}).format(new Date());


function journalSource(row){return row.data.offline?'offline':row.historical?'retry':'live';}
function journalFilters(){return new URLSearchParams({source:el('journal-filter').value,q:el('journal-search').value.trim(),from:el('journal-from').value,to:el('journal-to').value});}
function resetJournalPage(){journalPage=0;journalResult=null;refreshJournal();}
let journalFetchingKey='';
async function refreshJournal(){
  const params=journalFilters();params.set('page',journalPage);params.set('limit',50);const key=params.toString();
  if(journalController&&journalFetchingKey===key)return;
  journalController?.abort();const controller=new AbortController();journalController=controller;journalFetchingKey=key;const id=++journalRequest;
  try{const response=await fetch('/api/history?'+key,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6000)])});if(!response.ok)throw Error('filter');const data=await response.json();if(id!==journalRequest)return;journalResult=data;el('journal-error').textContent='';renderJournal(latest||{});}
  catch(error){if(id===journalRequest&&!controller.signal.aborted)el('journal-error').textContent='Chưa tải được lịch sử. Kiểm tra kết nối và khoảng ngày đã chọn.';}
  finally{if(id===journalRequest)journalController=null;}
}
function policyNotice(text,error=false){el('cards-notice').textContent=text;el('cards-notice').className='command-notice '+(error?'error':'');}
function minuteText(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function epochDate(seconds,last=false){return seconds?new Date((seconds-(last?1:0))*1000+7*3600000).toISOString().slice(0,10):'';}
function policyDescription(card){
  if(isHotelStay(card))return 'Lưu trú: nhận 14:00 ngày '+epochDate(card.valid_from).split('-').reverse().join('/')+' · trả 12:00 ngày '+epochDate(card.valid_until).split('-').reverse().join('/')+' · dùng liên tục (UTC+7)';
  const days=['T2','T3','T4','T5','T6','T7','CN'].filter((_,i)=>card.days&(1<<i)).join(', ')||'không ngày nào';
  return (card.start===-1?'Cả ngày':minuteText(card.start)+'–'+minuteText(card.end)+(card.start>card.end?' · qua đêm':''))+' · '+days+(card.valid_from?' · từ '+epochDate(card.valid_from):'')+(card.valid_until?' · hết '+epochDate(card.valid_until,true):'');
}
function renderCards(d){
  const policy=d.card_policy||{};el('cards-status').textContent=!policy.supported?'Cần firmware mới hỗ trợ quản lý thẻ.':policy.applied?'Thiết bị đã lưu và áp dụng quyền thẻ · phiên bản '+policy.revision:policy.error?'Chưa xác nhận cấu hình: '+policy.error:!policy.ready?'Thiết bị chưa sẵn sàng. Danh sách là cấu hình gần nhất.':'Đang chờ thiết bị lưu và áp dụng cấu hình · phiên bản '+policy.revision;
  el('cards-clock').textContent=policy.clock_synced?'Đồng hồ thiết bị đã đồng bộ. Quyền theo lịch dùng giờ UTC+7.':'Chưa xác nhận giờ thực. Thẻ có lịch/ngày hiệu lực sẽ bị từ chối khi thiết bị chưa biết giờ; thẻ cả ngày không giới hạn vẫn dùng được.';
  const canEdit=policy.can_edit&&!!el('token').value.trim()&&!cardSubmitting;
  el('card-save').disabled=!canEdit;el('cards-retry').disabled=!policy.ready||!el('token').value.trim()||cardSubmitting;
  const nextKey=JSON.stringify({cards:policy.cards||[],canEdit:!!canEdit});if(nextKey===cardListKey)return;cardListKey=nextKey;
  const list=el('cards-list');list.replaceChildren();
  for(const card of policy.cards||[]){
    const block=node('article',undefined,'managed-card'),head=node('div',undefined,'managed-card-head'),actions=node('div',undefined,'managed-card-actions');
    head.append(node('b',card.name),pill(card.enabled?'Đang bật':'Đã tắt',card.enabled?'success':'neutral'));block.append(head,node('small',formatUid(card.uid)),node('small',policyDescription(card)));
    for(const [label,action,danger] of [['Sửa',()=>editCard(card),false],[card.enabled?'Tắt quyền':'Bật quyền',()=>stageCards((policy.cards||[]).map(c=>c.uid===card.uid?{...c,enabled:!c.enabled}:c),(card.enabled?'Tắt':'Bật')+' quyền thẻ '+card.name),false],['Xóa',()=>stageCards((policy.cards||[]).filter(c=>c.uid!==card.uid),'Xóa thẻ '+card.name+' khỏi danh sách quyền'),true]]){
      const button=node('button',label,'button secondary compact'+(danger?' danger-outline':''));button.type='button';button.disabled=!canEdit;button.onclick=action;actions.append(button);
    }
    block.append(actions);list.append(block);
  }
  if(!(policy.cards||[]).length)empty(list,'Chưa có thẻ','Thêm UID thẻ để cấp quyền RFID.');
}
function updateCardSchedule(){
  const hotel=el('card-schedule').value==='hotel';el('card-time-fields').hidden=el('card-schedule').value!=='window';el('card-weekday-field').hidden=hotel;
  el('card-from-label').textContent=hotel?'Ngày nhận phòng':'Bắt đầu hiệu lực';el('card-until-label').textContent=hotel?'Ngày trả phòng':'Ngày hết hạn';
  el('card-schedule-help').textContent=hotel?'Nhận phòng 14:00, trả phòng 12:00 (UTC+7). Thẻ dùng liên tục cả ngày và đêm trong thời gian lưu trú; ngày trả phải sau ngày nhận.':'Để trống ngày: không giới hạn. Ngày hết hạn gồm cả ngày đã chọn. Khung giờ qua đêm được tính theo ngày bắt đầu.';
  el('card-stay-preview').hidden=!hotel;
  if(hotel){try{const fields=makeCardSchedule('hotel',el('card-from').value,el('card-until').value,'','',127);el('card-stay-preview').textContent=policyDescription(fields);}catch{el('card-stay-preview').textContent='Chọn ngày nhận và ngày trả để xem thời hạn dùng thẻ.';}}
  syncSelectControls();syncDateControls();syncTimeControls();
}
function resetCardForm(){editingUid=null;el('card-form').reset();el('card-uid').readOnly=false;el('card-form-title').textContent='Thêm thẻ';for(const box of el('card-days').querySelectorAll('input'))box.checked=true;updateCardSchedule();}
function editCard(card){
  editingUid=card.uid;el('card-form-title').textContent='Sửa thẻ '+card.name;el('card-uid').value=card.uid;el('card-uid').readOnly=true;el('card-name').value=card.name;el('card-enabled').checked=card.enabled;
  const hotel=isHotelStay(card);el('card-schedule').value=hotel?'hotel':card.start===-1?'all':'window';
  if(card.start!==-1){el('card-start').value=minuteText(card.start);el('card-end').value=minuteText(card.end);}
  for(const box of el('card-days').querySelectorAll('input'))box.checked=!!(card.days&(1<<Number(box.value)));
  el('card-from').value=epochDate(card.valid_from);el('card-until').value=epochDate(card.valid_until,!hotel);updateCardSchedule();el('card-name').focus();
}
function stageCards(cards,description){
  const policy=latest?.card_policy;if(!policy?.can_edit||!el('token').value.trim()){policyNotice('Cần mã điều khiển và cấu hình thiết bị đã xác nhận.',true);return;}
  cardDraft={expected_revision:policy.revision,cards};el('card-confirm-description').textContent=description+'\nQuyền mới sẽ được lưu trên ESP32 và áp dụng cho các lần quét tiếp theo.';el('card-confirm-dialog').showModal();
}
async function submitCards(body){
  if(cardSubmitting)return;cardSubmitting=true;renderCards(latest||{});policyNotice('Đang gửi cấu hình…');
  try{const response=await fetch('/api/cards',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+el('token').value.trim()},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});const result=await response.json();if(!response.ok)throw Error(result.error||'request');policyNotice('Đã lưu yêu cầu · phiên bản '+result.revision+'. Chờ thiết bị xác nhận lưu và áp dụng.');resetCardForm();}
  catch(error){const messages={forbidden:'Mã điều khiển không đúng.',policy_pending:'Có cấu hình đang chờ đồng bộ.',policy_conflict:'Danh sách vừa thay đổi. Tải lại rồi sửa tiếp.',offline_or_stale:'Thiết bị chưa sẵn sàng.',card_name:'Tên thẻ tối đa 48 byte UTF-8.',schedule:'Khung giờ/ngày không hợp lệ.',validity:'Khoảng ngày hiệu lực không hợp lệ.',uid_invalid_or_duplicate:'UID sai hoặc bị trùng.',policy_schema:'Tối đa 8 thẻ, kiểm tra dữ liệu.'};policyNotice(messages[error.message]||'Chưa cập nhật được quyền thẻ ('+error.message+').',true);}
  finally{cardSubmitting=false;refresh();}
}
function renderMonitor(d){if(!monitorDirty)el('monitor-enabled').checked=d.telegram?.monitor_enabled!==false;}
function initializeFeatures(){
  for(const [i,label] of ['T2','T3','T4','T5','T6','T7','CN'].entries()){const wrapper=node('label'),box=document.createElement('input');box.type='checkbox';box.value=i;box.checked=box.defaultChecked=true;wrapper.append(box,document.createTextNode(label));el('card-days').append(wrapper);}
  enhanceSelects();enhanceDates();enhanceTimes();
  el('cards-token').oninput=()=>{el('token').value=el('cards-token').value;lockButtons();renderCards(latest||{});};
  el('cards-new').onclick=resetCardForm;el('card-reset').onclick=resetCardForm;el('card-schedule').onchange=updateCardSchedule;el('card-from').addEventListener('change',updateCardSchedule);el('card-until').addEventListener('change',updateCardSchedule);
  el('card-last-scan').onclick=()=>{const last=latest?.rfid_history?.slice().reverse().find(r=>r.uid);if(!last){policyNotice('Chưa có UID trực tiếp. Quét thẻ trong Wokwi trước.',true);return;}resetCardForm();el('card-uid').value=last.uid;policyNotice('Đã điền UID vừa quét. Nhập tên/quyền rồi lưu.');};
  el('card-form').onsubmit=event=>{
    event.preventDefault();const uid=el('card-uid').value.replace(/[:\s]/g,'').toUpperCase(),name=el('card-name').value.trim();
    if(!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid)||!name||new TextEncoder().encode(name).length>48){policyNotice('Kiểm tra UID và tên (tối đa 48 byte UTF-8).',true);return;}
    const current=latest?.card_policy?.cards||[];if(!editingUid&&current.some(c=>c.uid===uid)){policyNotice('UID này đã có; dùng nút Sửa trên thẻ.',true);return;}
    const days=[...el('card-days').querySelectorAll('input:checked')].reduce((mask,box)=>mask|(1<<Number(box.value)),0);
    let fields;try{fields=makeCardSchedule(el('card-schedule').value,el('card-from').value,el('card-until').value,el('card-start').value,el('card-end').value,days);}catch(error){policyNotice(error.message==='hotel_dates'?'Chọn đủ ngày nhận/trả phòng; ngày trả phải sau ngày nhận.':'Khoảng ngày/giờ không hợp lệ.',true);return;}
    const card={uid,name,enabled:el('card-enabled').checked,...fields};const cards=editingUid?current.map(c=>c.uid===editingUid?card:c):[...current,card];stageCards(cards,(editingUid?'Cập nhật':'Thêm')+' thẻ '+name+' · '+formatUid(uid)+'\n'+policyDescription(card));
  };
  el('card-confirm-cancel').onclick=()=>{cardDraft=null;el('card-confirm-dialog').close();};el('card-confirm-save').onclick=()=>{const body=cardDraft;cardDraft=null;el('card-confirm-dialog').close();if(body)submitCards(body);};el('cards-retry').onclick=()=>submitCards({retry:true});
  el('monitor-enabled').onchange=()=>{monitorDirty=true;};el('monitor-save').onclick=async()=>{if(!el('token').value.trim()){el('monitor-notice').textContent='Nhập mã điều khiển ở Tổng quan hoặc Quản lý thẻ.';return;}try{const r=await fetch('/api/monitor',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+el('token').value.trim()},body:JSON.stringify({enabled:el('monitor-enabled').checked}),signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();monitorDirty=false;el('monitor-notice').textContent='Đã lưu lựa chọn thông báo kết nối.';refresh();}catch{el('monitor-notice').textContent='Chưa lưu được; kiểm tra mã điều khiển và kết nối Web.';}};
  const mic=initializeMicMeter({onLevel:value=>{el('voice-meter-fill').style.width=value+'%';el('voice-meter').setAttribute('aria-valuenow',String(value));},onInfo:text=>el('voice-mic-info').textContent=text});
  const voice=initializeVoice({onText:(text,final)=>el('voice-transcript').textContent=text?(final?'Đã nghe: ':'Đang nhận: ')+text:'',onState:(state,error)=>{
    if(state==='starting'){el('voice-meter-row').hidden=false;mic.start();}else if(!['listening','processing'].includes(state))mic.stop();
    const active=['starting','listening','processing'].includes(state);el('voice-start').dataset.listening=String(active);el('voice-start').disabled=state==='unsupported'||state==='processing';el('voice-button-label').textContent=state==='processing'?'Đang nhận lệnh…':active?'Dừng nghe':'Nói lệnh';
    if(state==='unsupported')el('voice-state').textContent='Trình duyệt chưa hỗ trợ nhận dạng. Mở Web bằng Chrome hoặc Edge có hỗ trợ tiếng Việt.';
    else if(state==='error')el('voice-state').textContent=({ 'not-allowed':'Micro chưa được cho phép. Bạn cần cấp quyền micro cho trang Web rồi thử lại.', 'service-not-allowed':'Trình duyệt không cho phép dịch vụ nhận dạng. Thử Web bằng Chrome.', 'audio-capture':'Không nhận được micro. Kiểm tra micro đang cắm và được chọn trên máy.',network:'Không kết nối được dịch vụ nhận dạng. Kiểm tra mạng hoặc thử Chrome.', 'no-speech':'Chưa nghe được câu nói. Bấm micro rồi nói rõ một câu.',no_result:'Đã dừng nhưng chưa nhận được câu nói. Bấm micro, nói rồi chờ; không cần bấm dừng.',no_final_result:'Có âm thanh nhưng chưa nhận được câu hoàn chỉnh. Nói lại một câu ngắn.',timeout:'Dịch vụ nhận dạng không trả kết quả sau 20 giây. Kiểm tra micro/mạng hoặc thử Chrome.'}[error]||'Nhận dạng chưa hoạt động ('+error+').');
    else el('voice-state').textContent={starting:'Đang bật micro… Nếu trình duyệt hỏi, bạn hãy cho phép micro.',listening:error==='speech'?'Đã nghe thấy giọng nói. Nói hết một câu, Web sẽ tự nhận lệnh.':'Đang nghe… Nói “Xem lịch sử cửa” rồi chờ một chút.',processing:'Đang chuyển câu nói thành lệnh…',recognized:'Đã nhận lệnh và chuyển đến mục tương ứng.',unknown:'Chưa hiểu câu này. Thử “Đọc trạng thái cửa” hoặc “Xem lịch sử cửa”.',idle:'Bấm micro để nói câu tiếp theo.'}[state]||'';
  },onIntent:intent=>{
    if(intent==='unlock'){if(!ready||!el('token').value.trim()||pending||sending){notice('Cần mã điều khiển và thiết bị sẵn sàng trước khi mở khóa bằng giọng nói.','error');return;}el('unlock-dialog').showModal();notice('Đã nhận câu mở khóa. Kiểm tra và bấm xác nhận để gửi lệnh.');}
    else if(intent==='status'){selectPage('overview');send('status');}else selectPage(intent,true);
  }});
  el('voice-start').onclick=()=>voice.start();addEventListener('pagehide',()=>{voice.stop();mic.stop();});
}

initializeFeatures();refresh();setInterval(refresh,2000);
