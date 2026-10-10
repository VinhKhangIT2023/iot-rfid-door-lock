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
| `application/index.html` | Hiển thị trạng thái, điều khiển và ACK |

MQTT sử dụng các hậu tố `/availability`, `/state`, `/event`, `/cmd`, `/ack`. Lệnh gồm `session`, `seq`, `action`; action hỗ trợ `status` và `unlock`. Middleware gửi command QoS 1, không retain; chỉ cho gửi khi broker kết nối, thiết bị online và state trực tiếp không cũ quá 12 giây.

HTTP có `GET /api/door` để đọc dữ liệu và `POST /api/command` để gửi body `{"action":"status"}` hoặc `{"action":"unlock"}`, kèm header `Authorization: Bearer <mã điều khiển>`. Phản hồi 202 nghĩa là đã gửi lệnh; cần đọc ACK và quan sát mô hình để xác nhận kết quả.

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
