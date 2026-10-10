# Changelog

[Về README](README.md) · [Kết quả](docs/results.md) · [Kiểm thử](docs/testing.md)

Chỉ ghi thay đổi đã thực hiện. Project chưa có bản release được đánh số.

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
