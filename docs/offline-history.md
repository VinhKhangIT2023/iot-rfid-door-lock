# Nhật ký Offline và gửi bù

[Về README](../README.md) · [Telegram](telegram.md) · [Kiến trúc](architecture.md)

Khi ESP32 mất Wi-Fi/MQTT, RFID, cảm biến cửa, servo và còi vẫn hoạt động local. Firmware giữ sự kiện; khi mạng trở lại, gửi lịch sử lên Web và Telegram. Ví dụ mở trái phép rồi đóng cửa trong lúc mất mạng vẫn được ghi nhận khi kết nối lại, dù trạng thái hiện tại đã là LOCKED/CLOSED.

## Cách sử dụng

1. Chạy middleware và Wokwi như [hướng dẫn](getting-started.md). Với bản cập nhật này phải build firmware mới và tạo lại flow/restart middleware.
2. Mở tab **Lịch sử cửa** trên Web. Có tìm kiếm và bộ lọc Tất cả/Gửi bù/Offline/Trực tiếp.
3. Sự kiện gửi bù có nhãn riêng. Thời gian xảy ra lấy từ đồng hồ thiết bị nếu đã đồng bộ NTP; thời gian nhận ở Web được ghi riêng. Nếu thiết bị chưa có giờ thực, hiển thị uptime và boot ID, không tự đặt giờ xảy ra.
4. Khi Telegram đã cấu hình, bot tự gửi **Lịch sử đồng bộ**, tối đa 8 sự kiện mỗi tin. Nội dung có mở/đóng cửa, cấp quyền/thẻ sai, khóa tạm và R1/R2. Đây là nhật ký quá khứ, không xác nhận trạng thái cửa hiện tại.

Nhật ký lưu tại `runtime/event_journal.jsonl` của project, không nằm trên Git. Web giữ lịch sử qua restart middleware, hiển thị 300 bản ghi gần nhất; file giữ các bản ghi và dấu đã gửi Telegram. Không xóa file này khi muốn giữ lịch sử và dấu chống lặp.

## Cơ chế lưu và xác nhận

- Mỗi sự kiện có `event_id = boot_id-sequence`, uptime gốc, cờ Offline và giờ thực nếu có. Heartbeat không ghi vào nhật ký NVS.
- MQTT worker ghi sự kiện vào **24 ô NVS** của ESP32; FSM không chờ ghi flash hoặc mạng. Có thêm hàng đợi RAM 64 gói và một gói đang chờ ghi. Bản ghi chỉ bền vững sau khi worker ghi NVS thành công.
- Middleware lưu và `fsync` trước khi gửi `/history_ack`. Chỉ receipt khớp ID đang gửi và session hiện tại mới cho firmware xóa bản ghi. Lỗi lưu file không có ACK.
- Khi reconnect, reboot hoặc chưa được ACK, sự kiện cũ được gửi qua `/history`. Middleware kiểm tra phiên nhận hiện tại nhưng không yêu cầu boot gốc trùng boot mới. Dữ liệu lịch sử không thay state, ACK điều khiển, cờ cảnh báo hoặc bộ đếm RFID trực tiếp; không gửi status/unlock từ lịch sử.
- ID đã lưu được ACK lại để thiết bị giải phóng bộ nhớ, không thêm bản ghi trùng. Sự kiện trực tiếp của firmware mới cũng được lưu, giúp chống tạo lại cảnh báo khi controller restart.

NVS giữ dữ liệu qua khởi động lại/mất nguồn trên ESP32; khả năng giữ flash khi Stop/Start hoặc tạo phiên Wokwi mới cần kiểm tra riêng với môi trường mô phỏng, không suy từ software reboot. [Preferences/NVS chính thức](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html).

## Giới hạn cụ thể

Bộ nhớ có giới hạn. Firmware giữ nguyên 24 bản ghi NVS chưa được xác nhận, không ghi đè; khi đầy, các sự kiện tiếp theo chờ trong RAM. Nếu cả hàng đợi RAM đầy, `dropped` tăng; không bảo đảm giữ vô hạn khi Offline lâu. Nếu mất nguồn trước khi worker ghi NVS, phần đang ở RAM có thể mất. Web hiển thị `journal_pending`, `journal_capacity`, `journal_ok` khi state còn mới.

Telegram lịch sử dùng outbox lưu trên máy. Lỗi API/mạng giữ các bản chưa xác nhận và thử lại sau ít nhất 60 giây trong lúc dịch vụ còn chạy. Tắt `enabled` giữ outbox chờ; bật lại tiếp tục gửi. Sau API thành công, dấu đã gửi được ghi vào file. Timeout hoặc crash sau khi Telegram nhận nhưng trước khi lưu dấu có thể gây gửi lại; các tin có ID để đối chiếu. API không cung cấp bảo đảm đúng một lần cho thao tác này. Cảnh báo trực tiếp R1/R2 giữ chính sách cũ, không tự thử lại.

Đồng hồ NTP có độ chính xác theo giây trong payload hiện tại. Timer cửa dùng uptime mô phỏng; số đo timer không suy từ chênh giờ lịch. MQTT vẫn dùng broker công cộng; kiểm tra session/ID giúp chống nhầm dữ liệu, không thay TLS/ACL.

## Kiểm thử ngày 14/10/2026

- 18/18 bài lịch sử gồm lưu file/restart, trùng ID/xung đột, lỗi fsync, dòng ghi dở, dữ liệu cũ/retained, không ảnh hưởng điều khiển và outbox Telegram giả lập; toàn bộ test kế thừa đạt.
- Build ESP32 đạt: RAM 57692 B (17,6%), Flash 805197 B (61,4%).
- Người dùng thực hiện R1 và RFID Blue→OPEN→R2→CLOSED khi đã `netoff`. Sau `neton`, 9/9 sự kiện được lưu, Telegram API nhận đủ và người dùng xác nhận thấy đầy đủ; firmware nhận 9 ACK, pending=0, dropped=0.
- Software reboot: 2 sự kiện SERIAL unlock/no-entry được giữ trong NVS, đọc lại ở boot mới, gửi qua history và ACK về 0. Wokwi có thêm reset watchdog và cảnh báo calibration MAC trong lượt này rồi phục hồi; chưa thử cắt điện thiết bị thật.
- Restart middleware và kiểm tra Web thực được ghi riêng trong hồ sơ tuần 9 khi hoàn tất.

`netoff`, `neton`, `stateoff`, `stateon`, `reboot` chỉ là lệnh Serial chẩn đoán, không được nhận qua API/MQTT command. Stop Simulation dừng cả thiết bị nên không dùng để mô phỏng một người mở cửa khi mất Wi-Fi.
