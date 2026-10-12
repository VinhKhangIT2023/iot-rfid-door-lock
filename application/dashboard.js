'use strict';
const el=id=>document.getElementById(id);
let ready=false, sending=false, refreshing=false, latest=null, pending=null;
const pages=['overview','rfid','technical'];
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
  for(const page of pages){const active=page===name;el('page-'+page).hidden=!active;const tab=el('tab-'+page);tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  el('page-label').textContent={overview:'Tổng quan',rfid:'Hoạt động RFID',technical:'Thông tin kỹ thuật'}[name];
  if(focus)el('tab-'+name).focus();
}
function lockButtons(){
  for(const action of ['status','unlock'])el(action).disabled=!ready||!el('token').value.trim()||sending||!!pending;
  el('confirm-unlock').disabled=!ready||!el('token').value.trim()||sending||!!pending;
}
function notice(text,tone=''){el('notice').textContent=text;el('notice').className='command-notice'+(tone?' '+tone:'');}
function renderConnection(d){
  ready=!!d.ready;
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
  if(pending&&ack?.seq===pending.seq){
    notice(ack.result==='executed'?'Thiết bị đã xử lý lệnh '+(pending.action==='unlock'?'mở khóa':'đọc trạng thái')+'.':labels[ack.result]||'Thiết bị trả phản hồi chưa xác định.',ack.result==='executed'?'success':'error');pending=null;
  }else if(pending&&Date.now()-pending.started>20000){notice('Chưa nhận ACK khớp lệnh đã gửi. Kiểm tra thiết bị; hệ thống không tự gửi lại.','error');pending=null;}
  lockButtons();
}
function renderHistory(d){
  const history=d.history||[],tbody=el('history');tbody.replaceChildren();
  for(const row of history.slice(-20).reverse()){
    const tr=node('tr'),kind=node('td',row.topic.split('/').pop());
    if(row.retained)kind.append(node('small','retained','row-retained'));
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
    renderConnection(d);renderRfid(d);renderAlerts(d);renderAck(d);renderHistory(d);
    el('updated').textContent='Cập nhật '+stamp(new Date().toISOString())+' · UTC+7';
  }catch(error){
    renderConnection({...latest,ready:false,connection:'app_offline',age_ms:null});
    el('updated').textContent='Chưa kết nối ứng dụng';
  }finally{refreshing=false;}
}
async function send(action){
  if(pending){notice('Đang chờ phản hồi cho lệnh trước.');return;}
  if(!ready||sending||!el('token').value.trim()){notice('Cần mã điều khiển và trạng thái thiết bị mới.','error');return;}
  sending=true;lockButtons();notice('Đang gửi lệnh…');
  try{
    const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+el('token').value.trim()},body:JSON.stringify({action}),signal:AbortSignal.timeout(6000)});
    const result=await response.json();
    if(response.ok){pending={seq:result.seq,action,started:Date.now()};notice('Đã gửi lệnh · seq '+result.seq+'. Đang chờ phản hồi thiết bị.');}
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
el('token').addEventListener('input',lockButtons);
el('status').onclick=()=>send('status');
el('unlock').onclick=()=>el('unlock-dialog').showModal();
el('cancel-unlock').onclick=()=>el('unlock-dialog').close();
el('confirm-unlock').onclick=()=>{el('unlock-dialog').close();send('unlock');};
el('today').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Bangkok'}).format(new Date());
refresh();setInterval(refresh,2000);
