# Kết quả hiện tại

[Về README](../README.md) · [Cách chạy](getting-started.md) · [Kiểm thử](testing.md) · [Lịch sử thay đổi](../CHANGELOG.md)

## Phạm vi

Bản code kế thừa tuần 6 của nhóm: ESP32 mô phỏng trên Wokwi, MQTT, Node-RED và Web App. Phần dưới tổng hợp kết quả đã ghi trong hồ sơ tuần 6 ngày 09/10/2026; không phải một lần chạy E2E mới sau khi gom project.

## Sản phẩm đã có

| Thành phần | Nội dung đã triển khai |
|---|---|
| Firmware | RFID whitelist, debounce cửa, các trạng thái khóa, timer, khóa tạm khi quét sai và cảnh báo |
| Mạch mô phỏng | ESP32, RC522, công tắc cửa, relay, servo và buzzer trong diagram.json |
| Kết nối | Wi-Fi/MQTT, state/event/availability/ack, session và sequence cho command |
| Middleware | Model trạng thái, freshness, chặn offline/retained, history và rule DOOR_FORCED |
| Web | Dashboard, trạng thái cửa/khóa, mã điều khiển, status/unlock, hộp xác nhận, ACK và cảnh báo |
| Công cụ | Generator flow, test logic và Python console chẩn đoán tùy chọn |

## Kiểm thử mô phỏng ngày 09/10/2026

Hồ sơ nhóm ghi nhận **8/8 bài đạt trong phạm vi từng bài**, xác nhận luồng thiết bị → MQTT → middleware → Web và chiều điều khiển ngược lại trong mô phỏng. Kết quả thuộc lượt chạy ngày 09/10/2026, không phải cam kết mọi cấu hình hoặc phiên bản sau đều đã được kiểm tra.

| Bài | Kết quả đã ghi nhận |
|---|---|
| W6-01 — Dashboard online | Web nhận state trực tiếp, hiển thị LOCKED/CLOSED |
| W6-02 — Chu kỳ RFID | Blue được cấp quyền; mở/đóng cửa hợp lệ và khóa lại sau khoảng 5 giây mô phỏng |
| W6-03 — Đọc trạng thái | Lệnh status từ Web có ACK executed khớp sequence |
| W6-04 — Mở khóa từ Web | Unlock được thực thi; người dùng xác nhận servo quay mở rồi tự quay về khóa khi giữ cửa CLOSED |
| W6-05 — Mã sai | HTTP 403, không có command MQTT mới |
| W6-06 — Mất mạng | Nhánh netoff khóa nút; API với mã đúng trả 409; state retained không cấp quyền điều khiển |
| W6-07 — Kết nối lại | neton tạo session/state trực tiếp mới; status và ACK hoạt động lại |
| W6-08 — Mở trái phép | DOOR_FORCED tạo cảnh báo; rule gửi status, có ACK; đóng cửa rồi phục hồi LOCKED/CLOSED |

Servo ở W6-04 được người dùng quan sát và xác nhận bằng văn bản; chưa có ảnh/video servo trong hồ sơ đã đối chiếu. W6-06 xác nhận nhánh netoff, chưa đo riêng tình huống state stale khi thiết bị vẫn online trong bài E2E. Có log ALARM_MUTED, nhưng không dùng log đó để khẳng định người dùng đã nghe âm còi.

## Ảnh Web đã có

Hai ảnh dưới được giữ nguyên từ lượt chạy tuần 6 ngày 09/10/2026; mã điều khiển trên ảnh đã được che bằng ô password. Ảnh Web không thay cho ảnh chuyển động servo.

### Dashboard khi online

![Web online, cửa đóng và khóa](images/dashboard-w6.png)

### Cảnh báo mở cửa trái phép

![Web ALARM/OPEN, cảnh báo DOOR_FORCED và ACK](images/alarm-w6.png)

## Kiểm tra phần mềm sau khi gom project

Ngày 10–11/10/2026 đã đối chiếu source chính với baseline tuần 6, chạy test logic middleware, kiểm tra Node-RED khởi động ở đường dẫn mới và kiểm tra bản sao source độc lập tạo được flow/test. Log mặc định nằm trong runtime của repo; tùy chọn theo tuần vẫn có thể dùng trên máy nhóm.

Các lần kiểm tra này không build lại firmware hay chạy Wokwi E2E mới. Firmware, core và giao diện chức năng vẫn kế thừa tuần 6.

## Phần chưa triển khai hoặc chưa có kết quả

Telegram, mở khóa bằng giọng nói, rule R2 của giai đoạn sau, NVS/gửi bù và cấu hình broker TLS/ACL chưa được triển khai. Chưa thử khóa cửa thật. Các tính năng và lần kiểm thử tiếp theo sẽ được bổ sung khi có kết quả thực tế.

