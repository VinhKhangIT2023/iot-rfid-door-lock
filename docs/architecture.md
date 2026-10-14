# Cấu trúc và giao tiếp

[Về README](../README.md) · [Kết quả](results.md) · [Kiểm thử](testing.md) · [Lịch sử thay đổi](../CHANGELOG.md)

RFID và công tắc cửa được ESP32 đọc để điều khiển relay, servo và buzzer. ESP32 gửi dữ liệu qua MQTT đến Node-RED trên máy tính; Node-RED phục vụ Web và chuyển lệnh từ Web về ESP32. Web không cần server frontend riêng.

| File | Vai trò |
|---|---|
| `src/main.cpp` | RFID, whitelist, timer, trạng thái cửa và actuator |
| `src/network_bridge.cpp` | Wi-Fi/MQTT, queue, session, sequence và nhận lệnh |
| `include/network_config.h` | Wi-Fi mô phỏng, broker và topic BASE |
| `middleware/core.js` | Model dữ liệu, freshness, rule và tạo lệnh |
| `middleware/generate_flow.js` | Tạo flow Node-RED và nhúng giao diện HTML |
| `middleware/start.js`, `settings.js` | Khởi động và cấu hình Node-RED |
| `application/index.html` | Bố cục ba tab, dashboard, RFID và thông tin kỹ thuật |
| `application/styles.css` | Màu sắc và bố cục desktop/mobile |
| `application/dashboard.js` | Poll API, tìm/lọc RFID, điều khiển và đối chiếu ACK |

MQTT sử dụng các hậu tố `/availability`, `/state`, `/event`, `/cmd`, `/ack`. Lệnh gồm `session`, `seq`, `action`; action hỗ trợ `status` và `unlock`. Middleware gửi command QoS 1, không retain; chỉ cho gửi khi broker kết nối, thiết bị online và state trực tiếp không cũ quá 12 giây.

HTTP có `GET /api/door` để đọc dữ liệu và `POST /api/command` để gửi body `{"action":"status"}` hoặc `{"action":"unlock"}`, kèm header `Authorization: Bearer <mã điều khiển>`. Phản hồi 202 nghĩa là đã gửi lệnh; cần đọc ACK và quan sát mô hình để xác nhận kết quả.

## Hai quy tắc middleware

| Quy tắc | Trigger và kết quả | Reset |
|---|---|---|
| R1 | DOOR_FORCED trực tiếp tạo cảnh báo đỏ và một yêu cầu status qua cổng gửi chung. Ghi status sent/blocked, seq hoặc lý do. Không tự thử lại yêu cầu bị chặn | State trực tiếp ngoài ALARM hoặc session trực tiếp mới |
| R2 | LEFT_OPEN_WARN trực tiếp với state DOOR_OPEN_AUTH, đã quan sát state trực tiếp DOOR_OPEN_AUTH/OPEN, tạo lời nhắc vàng. Không tạo status/unlock, không chuyển state sang ALARM | DOOR_CLOSED trực tiếp, state trực tiếp CLOSED hoặc session trực tiếp mới |

Cờ hai rule độc lập; mỗi đợt tạo một cảnh báo. Retained không tạo cảnh báo hoặc reset cờ. R2 kiểm tra state trực tiếp tương thích, không áp dụng thêm ranh giới freshness 12 giây như cổng gửi command. Firmware tuần 8 thêm session vào event. Từ tuần 9, event/ACK chỉ tác động model khi không retained và session hợp lệ khớp state trực tiếp đã quan sát. Rule/RFID ghi thêm `event_session` và `session_verified`; bản tin không đạt chỉ giữ trong raw history với `ignored_reason`. Event đến trước state không được phát lại. State trực tiếp từ một trong 32 phiên đã nghỉ gần nhất cũng bị bỏ qua; danh sách này chỉ tồn tại trong bộ nhớ, không phải xác thực broker.

API `/api/door` có `rule_history`. File JSONL ghi MQTT row, `rule` và `rule_action`; bộ nhớ giữ tối đa 200 MQTT rows, 200 rule rows, 50 alerts. Restart middleware xóa bộ nhớ/cờ, file log vẫn ghi nối tiếp. ACK tuần 8 chứa seq/result/state/uptime/session, chưa có action; đối chiếu seq và session với command trong lượt chạy.

## Dashboard và theo dõi RFID

Generator nhúng CSS/JavaScript vào HTML của flow, không tải CDN và không cần server frontend riêng. Sau khi sửa file trong `application/`, sinh lại flow, restart middleware và tải lại trang Web.

API bổ sung `connection` (`ready`, `broker_offline`, `device_offline`, `waiting_state`, `stale`), `broker_connected`, `device_online`, `rfid_history` và `rfid_counts`. Freshness 12 giây giữ nguyên. Từ tuần 8, state hợp lệ không retained xác nhận online trở lại khi availability lưu cũ đang offline. Availability offline hoặc mất broker vẫn chặn lệnh; online đơn lẻ/retained state không đủ để cấp quyền.

RFID chỉ được tính từ event trực tiếp: `UNLOCK_GRANTED` có `src=RFID` và UID hợp lệ, `CARD_DENIED`, `CARD_IGNORED_LOCKOUT`. `LOCKOUT_START/END` ghi hoạt động nhưng không tăng số lượt quét. Mở khóa REMOTE/SERIAL và event retained không tăng thống kê. Bộ nhớ giữ 100 sự kiện RFID riêng, không bị heartbeat đẩy mất; số lượt tính từ khi middleware khởi động, giữ qua reconnect nhưng xóa khi restart.

Khóa tạm hiện tại dựa vào `state.lockout` còn mới; lịch sử không được dùng để suy ra trạng thái hiện tại. RFID history ghi observed_session từ state, còn event thô tuần 8 có session do worker gắn khi publish. Web không quét thẻ hoặc thay đổi whitelist. Khi gửi lệnh, Web chờ ACK khớp cả seq và session của lệnh và state hiện tại, tạm khóa nút tránh gửi lặp và không tự gửi lại nếu chưa có ACK sau 20 giây máy tính.

## Mạch mô phỏng

Sơ đồ dây đầy đủ nằm trong [diagram.json](../diagram.json). Chân ứng dụng:

| Thiết bị / tín hiệu | GPIO ESP32 |
|---|---|
| RC522 SS / RST | 5 / 21 |
| RC522 SCK / MOSI / MISO | 18 / 23 / 19 |
| Công tắc cửa | 33; LOW là OPEN |
| Relay | 27; HIGH là mở khóa |
| Servo | 26; 0° khóa, 90° mở |
| Buzzer | 25 |

Timer nằm trong [main.cpp](../src/main.cpp); quyền thẻ mặc định và lưu NVS ở [access_policy.cpp](../src/access_policy.cpp).

## Trạng thái cửa

| Trạng thái | Ý nghĩa |
|---|---|
| `LOCKED` | Khóa đóng; mở cửa lúc này gây báo động |
| `UNLOCKED_WAIT_OPEN` | Đã cấp quyền, chờ mở cửa tối đa 5 giây |
| `DOOR_OPEN_AUTH` | Cửa mở có quyền; đóng ổn định 5 giây thì khóa lại |
| `ALARM` | Cửa bị mở khi chưa có quyền |

## Thông số hiện tại

Timer nằm trong `src/main.cpp`: debounce 50 ms, cooldown thẻ 1500 ms, cảnh báo mở lâu 15000 ms, giới hạn âm báo động 10000 ms. Ba lần quét sai liên tiếp gây khóa tạm RFID 10000 ms; bộ đếm sai được reset khi khoảng cách từ lần sai gần nhất đạt 30000 ms hoặc khi nhận thẻ hợp lệ. Đây là khoảng cách giữa các lần sai, không phải cửa sổ tổng 30 giây. Khóa tạm chỉ chặn RFID; REMOTE/Serial vẫn có thể cấp quyền theo chính sách hiện tại. Timer firmware dùng thời gian mô phỏng; freshness middleware dùng thời gian máy tính.

Nếu đổi BASE/broker hoặc sửa Web/flow, xem [cách cài và chạy](getting-started.md).

Tuần 8: heartbeat 1000 ms mô phỏng, snapshot 100 ms, loop nghỉ 5 ms để giảm tải Wokwi. loop_max_us đo phần xử lý, không cộng thời gian nghỉ. Wi-Fi dùng channel 6. Serial-only stateoff/stateon dừng/khôi phục state để kiểm tra stale khi MQTT vẫn kết nối; không phải command Web. `middleware/observe.js` chỉ đọc API và lưu kết nối/PC time/uptime, không điều khiển mô hình.

## Kiểm soát phiên và body HTTP (tuần 9)

State trực tiếp của phiên mới xóa ACK cũ và reset cờ rule/sequence. HTTP 202 trả cả session và seq. Web hủy lệnh đang chờ khi quan sát thiết bị đổi phiên; không tự gửi lại. Event/ACK của firmware tuần 6–7 không có session nên chỉ vào raw history; cần build firmware hiện tại (từ tuần 8).

`http_guard.js` chạy trước bộ parser chung của Node-RED cho POST `/api/command`, `/api/cards`, `/api/monitor`. Chấp nhận JSON object tối đa 2 KiB: JSON sai trả 400 `invalid_json`, array trả 400 `command_schema`, body quá lớn trả 413 `payload_too_large`, Content-Type khác application/json trả 415 `content_type`. Sau parse, sai mã trả 403; action sai hoặc offline/stale trả 409; lệnh hợp lệ trả 202. Các GET không đi qua guard này. `body-parser@1.20.8` được khai báo trực tiếp và khóa bằng lockfile, là phiên bản đã có trong cây dependency.

Session/seq hạn chế nhầm phiên và lặp lệnh; không thay thế TLS/ACL. Bearer code bảo vệ API local, không bảo vệ topic MQTT công cộng.

## Nhật ký bền vững và gửi bù

Firmware thêm `event_journal.h`: 24 bản ghi NVS, queue RAM 64, ID boot/sequence; MQTT worker ghi/xóa NVS, FSM không chờ flash/mạng. Event trực tiếp có metadata ID/boot/offline/giờ nếu có; `/history` chứa sự kiện gửi lại hoặc phục hồi sau reboot. Session trong bản lịch sử là phiên vận chuyển hiện tại; boot ID/uptime giữ nguồn gốc.

Middleware `history_store.js` lưu/fsync vào runtime/event_journal.jsonl rồi publish `/history_ack` JSON `{session,event_id}` QoS1 không retain. Firmware chỉ xóa head đang chờ khớp receipt; gửi lại sau 2 giây mô phỏng nếu chưa có receipt. Sự kiện lịch sử không cập nhật state/rule/RFID trực tiếp hay tạo command. API GET `/api/door` thêm `event_journal`; Web có tab Lịch sử cửa. `history_telegram.js` gửi outbox theo lô, lưu dấu thành công và giữ dữ liệu lỗi để retry. [Chi tiết và các giới hạn](offline-history.md).

## Quyền thẻ, bot và bộ lọc lịch sử

`access_policy.cpp` giữ cấu hình tối đa 8 thẻ trong NVS. MQTT worker kiểm tra schema, ghi cấu hình rồi chuyển qua queue tới loop chính; state báo phiên bản thực đã áp dụng. `/policy_cmd` gắn session hiện tại, không retain; `/policy_ack` báo lưu/từ chối; `/policy` chứa danh sách quan sát. Middleware giữ yêu cầu đã xác nhận ở runtime/card_policy.json, so sánh phiên bản để tránh ghi đè cấu hình mới hoặc dùng ACK lưu làm bằng chứng đã áp dụng. Giới hạn buffer MQTT 3072 byte, cấu hình command tối đa 2048 byte. Quyền thời gian dùng UTC+7, NTP và ngày bắt đầu cho lịch qua đêm. [Hướng dẫn quản lý thẻ](card-management.md).

POST `/api/cards` và `/api/monitor` cần Bearer mã điều khiển. GET `/api/history` trả total/page/limit/has_more/events; `/api/history.csv` giữ bộ lọc q/source/from/to, xuất tối đa 10.000 dòng. `history_query.js` tìm toàn bộ journal, không chỉ cửa sổ hiển thị gần nhất; các nguồn offline/retry/live loại trừ nhau. CSV giữ metadata gốc và chặn ký tự đầu có thể bị bảng tính diễn giải thành công thức.

`telegram_bot.js` đọc lệnh từ cuộc trò chuyện riêng của chủ sở hữu, bỏ qua lệnh quá 5 phút; chỉ đọc trạng thái/lịch sử/hướng dẫn. Theo dõi 30 giây mất trạng thái sẵn sàng rồi gửi một tin, phục hồi một tin; lựa chọn tạm dừng và outbox giữ trên máy. `event_presentation.js` chuyển mã sự kiện/detail thành lời cho người dùng; journal gốc vẫn nguyên. Voice chạy ở trình duyệt, nhận câu cố định và gọi đường UI/API hiện có, không thêm đường mở khóa tự động.
