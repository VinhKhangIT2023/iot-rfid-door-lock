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

Cờ hai rule độc lập; mỗi đợt tạo một cảnh báo. Retained không tạo cảnh báo hoặc reset cờ. R2 kiểm tra state trực tiếp tương thích, không áp dụng thêm ranh giới freshness 12 giây như cổng gửi command. Event thiếu session; `observed_session` trong rule log lấy từ state đã quan sát và không bảo đảm ghép tuyệt đối event đến muộn qua reconnect.

API `/api/door` có `rule_history`. File JSONL ghi MQTT row, `rule` và `rule_action`; bộ nhớ giữ tối đa 200 MQTT rows, 200 rule rows, 50 alerts. Restart middleware xóa bộ nhớ/cờ, file log vẫn ghi nối tiếp. ACK hiện chứa seq/result/state/uptime nhưng không có action/session; đối chiếu seq với command và session của command/state trong lượt chạy.

## Dashboard và theo dõi RFID

Generator nhúng CSS/JavaScript vào HTML của flow, không tải CDN và không cần server frontend riêng. Sau khi sửa file trong `application/`, sinh lại flow, restart middleware và tải lại trang Web.

API bổ sung `connection` (`ready`, `broker_offline`, `device_offline`, `waiting_state`, `stale`), `broker_connected`, `device_online`, `rfid_history` và `rfid_counts`. Điều kiện gửi lệnh và freshness 12 giây giữ nguyên.

RFID chỉ được tính từ event trực tiếp: `UNLOCK_GRANTED` có `src=RFID` và UID hợp lệ, `CARD_DENIED`, `CARD_IGNORED_LOCKOUT`. `LOCKOUT_START/END` ghi hoạt động nhưng không tăng số lượt quét. Mở khóa REMOTE/SERIAL và event retained không tăng thống kê. Bộ nhớ giữ 100 sự kiện RFID riêng, không bị heartbeat đẩy mất; số lượt tính từ khi middleware khởi động, giữ qua reconnect nhưng xóa khi restart.

Khóa tạm hiện tại dựa vào `state.lockout` còn mới; lịch sử không được dùng để suy ra trạng thái hiện tại. Session của event là session quan sát từ state. Web không quét thẻ hoặc thay đổi whitelist. Khi gửi lệnh, Web chờ ACK khớp seq, tạm khóa nút tránh gửi lặp và không tự gửi lại nếu chưa có ACK sau 20 giây máy tính.

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

Ngưỡng timer và whitelist nằm trong [main.cpp](../src/main.cpp).

## Trạng thái cửa

| Trạng thái | Ý nghĩa |
|---|---|
| `LOCKED` | Khóa đóng; mở cửa lúc này gây báo động |
| `UNLOCKED_WAIT_OPEN` | Đã cấp quyền, chờ mở cửa tối đa 5 giây |
| `DOOR_OPEN_AUTH` | Cửa mở có quyền; đóng ổn định 5 giây thì khóa lại |
| `ALARM` | Cửa bị mở khi chưa có quyền |

## Thông số hiện tại

Whitelist và timer nằm trong `src/main.cpp`: debounce 50 ms, cooldown thẻ 1500 ms, cảnh báo mở lâu 15000 ms, giới hạn âm báo động 10000 ms. Ba lần quét sai trong cửa sổ 30000 ms gây khóa tạm RFID 10000 ms. Timer firmware dùng thời gian mô phỏng; freshness middleware dùng thời gian máy tính.

Nếu đổi BASE/broker hoặc sửa Web/flow, xem [cách cài và chạy](getting-started.md).
