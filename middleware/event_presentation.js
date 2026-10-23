// User-facing wording is kept separate from the original diagnostic journal.
const LABELS={UNLOCK_GRANTED:'Đã cho phép mở khóa',CARD_DENIED:'Thẻ không được phép mở cửa',CARD_IGNORED_LOCKOUT:'Thẻ chưa thể dùng trong lúc tạm ngưng',LOCKOUT_START:'Tạm ngưng nhận thẻ',LOCKOUT_END:'Có thể dùng thẻ trở lại',DOOR_FORCED:'🚨 R1 · Cửa bị mở trái phép',DOOR_OPENED:'Cửa đã mở hợp lệ',DOOR_REOPENED:'Cửa được mở lại',DOOR_CLOSED:'Cửa đã đóng',RELOCKED:'Cửa đã khóa lại',LEFT_OPEN_WARN:'⚠️ R2 · Nhắc đóng cửa',ALARM_MUTED:'Còi đã ngừng phát',ALARM_CLEARED:'Báo động đã kết thúc',CMD_UNKNOWN:'Thao tác không được hỗ trợ',POLICY_APPLIED:'Đã cập nhật quyền dùng thẻ',BOOT_DOOR_OPEN:'Cửa đang mở khi bật thiết bị'};
const REASONS={not_registered:'Thẻ chưa được đăng ký.',disabled:'Thẻ đã bị tắt quyền sử dụng.',outside_schedule:'Đang ngoài ngày hoặc giờ được phép.',expired:'Quyền sử dụng thẻ đã hết hạn.',not_yet_valid:'Chưa đến ngày thẻ được phép dùng.',clock_unavailable:'Thiết bị chưa xác nhận được giờ để kiểm tra quyền thẻ.',policy_unavailable:'Chưa đọc được quyền thẻ đã lưu.'};
function detail(data){
  const raw=String(data.detail||''),uid=raw.match(/\buid=([0-9a-f]+)/i)?.[1],name=raw.match(/\bname=(.*?)(?=\s+\w+=|$)/)?.[1],card=name?'Thẻ “'+name+'”':uid?'Thẻ mã '+uid.toUpperCase():'';
  switch(data.evt){
    case 'UNLOCK_GRANTED':return raw.includes('src=RFID')?(card||'Thẻ hợp lệ')+' đã mở khóa.':raw.includes('src=REMOTE')?'Đã mở khóa từ Web.':'Đã mở khóa trong bài kiểm tra tại thiết bị.';
    case 'CARD_DENIED':return (card?card+': ':'')+(REASONS[raw.match(/\breason=(\w+)/)?.[1]]||'Thẻ không có quyền mở cửa.');
    case 'CARD_IGNORED_LOCKOUT':return 'Thiết bị đang tạm ngưng nhận thẻ sau nhiều lần bị từ chối. Vui lòng chờ.';
    case 'LOCKOUT_START':return 'Đã có 3 lần dùng thẻ không được phép. Tạm ngưng nhận thẻ trong 10 giây.';
    case 'LOCKOUT_END':return 'Thời gian tạm ngưng đã kết thúc. Bạn có thể quét thẻ lại.';
    case 'DOOR_FORCED':return 'Cửa đã mở khi chưa có quyền. Vui lòng kiểm tra cửa.';
    case 'DOOR_OPENED':return 'Cửa đã mở sau khi được cấp quyền.';
    case 'DOOR_REOPENED':return 'Cửa được mở lại trong lượt ra vào đã được cho phép.';
    case 'DOOR_CLOSED':return 'Cảm biến ghi nhận cửa đã đóng.';
    case 'RELOCKED':return raw.includes('timeout no entry')?'Đã cho phép mở khóa nhưng cửa không được mở trong 5 giây, nên khóa tự đóng lại.':'Cửa đã đóng; khóa đã tự đóng lại.';
    case 'LEFT_OPEN_WARN':return 'Cửa đã được mở hợp lệ nhưng để mở quá 15 giây. Vui lòng đóng cửa.';
    case 'ALARM_MUTED':return 'Còi đã hết thời gian phát. Kiểm tra trạng thái cửa trước khi sử dụng tiếp.';
    case 'ALARM_CLEARED':return 'Cửa đã đóng và hệ thống đã trở lại bình thường.';
    case 'POLICY_APPLIED':return 'Tên thẻ và quyền sử dụng mới đã có hiệu lực trên thiết bị.';
    case 'BOOT_DOOR_OPEN':return 'Hãy đóng cửa rồi kiểm tra trạng thái trên Web.';
    default:return 'Đã ghi nhận một hoạt động của thiết bị.';
  }
}
function title(data){
  if(data.evt==='UNLOCK_GRANTED'){
    if(String(data.detail||'').includes('src=REMOTE'))return 'Mở khóa từ Web';
    if(String(data.detail||'').includes('src=RFID'))return 'Mở khóa bằng thẻ';
  }
  return LABELS[data.evt]||'Hoạt động của cửa';
}
function source(row){return row.data.offline?'Xảy ra lúc mất mạng':row.historical?'Nhận bổ sung sau đó':'Ghi nhận trực tiếp';}
// Derived wording is added to API views only; the original stored event stays intact.
function present(row){return {...row,presentation:{title:title(row.data),detail:detail(row.data),source:source(row)}};}
module.exports={LABELS,detail,title,source,present};
