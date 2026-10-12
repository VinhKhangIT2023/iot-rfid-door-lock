# Changelog

[Về README](README.md) · [Kết quả](docs/results.md) · [Kiểm thử](docs/testing.md)

Chỉ ghi thay đổi đã thực hiện. Project chưa có bản release được đánh số.

## 12/10/2026 — Hai quy tắc tự động

- Bổ sung R2 chuyển LEFT_OPEN_WARN trực tiếp thành lời nhắc đóng cửa, cờ chống lặp và reset riêng.
- R1/R2 ghi lịch sử rule; R1 ghi status đã gửi hoặc lý do bị chặn.
- Web phân biệt cảnh báo đỏ/vàng và hiển thị lịch sử xử lý cảnh báo.
- Generator lấy topic từ core, ghi telemetry/rule riêng và giữ chế độ log độc lập hoặc theo tuần.
- Thêm 23 regression tuần 7 vào npm test, cùng bộ test kế thừa. Tất cả đạt trong phạm vi logic offline.
- Kiểm tra HTTP trên Node-RED thật: 403 mã sai, 409 khi chưa có state trực tiếp, không command mới. Retained startup không tạo cảnh báo hoặc cấp quyền.
- Firmware và ngưỡng giữ nguyên, binary đối chiếu baseline W6. 7/7 P0 đạt theo phạm vi logic/HTTP/Wokwi: baseline, hai đợt R1/R2, retained startup và netoff/neton với session mới/status/ACK.
- R2 đo uptime event 14999/15000 ms (~15s), không command tự mở khóa. Người dùng xác nhận servo và nghe còi. P1 stale-online có kiểm soát và hồi quy lockout/remote chuyển bước tiếp theo.

## 11/10/2026

### Thay đổi

- Chuẩn bị project độc lập cho repo chỉ chứa code; README dẫn tới hướng dẫn chạy, kiến trúc, kết quả và kiểm thử.
- Log mặc định nằm trong runtime của project; flow tạo tại máy người dùng và không commit.
- Bổ sung npm scripts flow/start và quy tắc ignore cache, môi trường, cấu hình runtime và mã điều khiển.
- Ghi lại kết quả mô phỏng đã có, kèm hai ảnh Web nguyên gốc; chuyển lịch sử sang changelog.

### Kiểm tra

Test middleware và bản sao source độc lập tạo flow/test đã đạt. Không build firmware hoặc chạy Wokwi E2E mới trong lần chuẩn bị này.

## 10/10/2026

- Gom firmware, middleware và Web App từ baseline tuần 6 thành một project dùng chung.
- Giữ hồ sơ và source lịch sử bên ngoài repo phát triển; loại các bản code/cache trùng.
- Kiểm tra source baseline, test middleware và Node-RED khởi động từ đường dẫn mới.

## 09/10/2026 — baseline bàn giao

- Đã có firmware RFID/state machine, kết nối MQTT, middleware và Web App.
- Hồ sơ nhóm ghi nhận 8/8 bài mô phỏng đạt theo phạm vi từng bài.
- Chi tiết tại [kết quả demo](docs/results.md).
