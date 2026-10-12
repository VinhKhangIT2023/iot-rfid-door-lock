# Kiểm thử

[Về README](../README.md) · [Kết quả](results.md) · [Lịch sử thay đổi](../CHANGELOG.md)

## Test middleware

Tại `middleware/`:

```sh
node generate_flow.js
npm test
```

Test hiện có kiểm tra freshness, retained, offline, sequence, action, broker, chống lặp rule, cú pháp flow và nhánh HTTP 403/409/202. Đây là test logic offline, không kết nối thiết bị thật hoặc xác nhận servo.

`npm test` chạy bộ kế thừa `tests.js` và 23 bài trong `tests_w7.js`. Bộ tuần 7 kiểm tra trigger R2, chống lặp/reset, cờ độc lập R1/R2, retained/session mới, payload lỗi, topic khác, giới hạn lịch sử, ranh giới freshness 12000/12001 ms và các function thực tế được sinh trong flow. Chạy riêng bằng `npm run test:w7` sau khi đã tạo flow. Test fixture chỉ nằm trong bộ nhớ, không publish lên broker.

Sau khi sửa `application/index.html` hoặc generator, dừng middleware, tạo lại flow và khởi động lại. `flows.json` chứa HTML và đường dẫn log của máy đang chạy, nên được sinh tại chỗ và không commit. Nếu sửa flow trong editor, đưa thay đổi về generator trước khi tạo lại để tránh mất thay đổi. Sau khi sửa firmware, build lại rồi restart mô phỏng.

## Kiểm tra dashboard/RFID

`npm test` còn chạy 8 bài trong `tests_dashboard.js`: phân biệt nguồn RFID/REMOTE/SERIAL; UID 4/7 byte; thẻ bị từ chối và bỏ qua khi lockout; không tính event retained; giữ lịch sử qua heartbeat/reconnect; giới hạn 100 sự kiện và thống kê từ khi khởi động; các trạng thái kết nối; API và HTML/CSS/JavaScript được generator nhúng đúng. Chạy riêng bằng `npm run test:dashboard`.

Sau khi sửa bất kỳ file HTML/CSS/JavaScript trong `application/`, sinh lại flow và restart middleware. Kiểm tra ba tab, tìm UID/tên, lọc kết quả, trạng thái không có kết quả, bố cục điện thoại, mã sai, xác nhận/hủy mở khóa và ACK khớp seq. Dữ liệu fixture dùng kiểm tra UI phải tách khỏi broker và ghi rõ; không tính là quét thẻ thật.

Để kiểm tra trực tiếp: mở middleware trước, chạy Wokwi rồi quét Blue và Red. Web cần ghi một cấp quyền và một từ chối đúng UID; lệnh unlock trên Web không tăng số lượt RFID. Đối chiếu lockout trực tiếp với state mới, không chỉ nhìn lịch sử.

## Các tình huống đã thử trong mô phỏng

Xem [bảng kết quả mô phỏng](results.md#kiểm-thử-mô-phỏng-ngày-09102026). Để chạy lại, thực hiện bước thử RFID/Web trong [hướng dẫn chạy](getting-started.md#4-khởi-động-mô-phỏng-và-thử), sau đó kiểm tra thêm mã sai, netoff/neton và cảnh báo. Lệnh Serial `netoff`/`neton` tạm dừng/phục hồi mạng của mô hình.

Ghi riêng kết quả mới, ngày chạy và phiên bản source; kết quả lịch sử tuần 6 không tự trở thành kết quả của phiên bản sau.

## Xác minh hai rule trên Wokwi

R1: từ LOCKED/CLOSED gạt OPEN, kiểm tra DOOR_FORCED và cảnh báo đỏ. Nếu đủ điều kiện gửi, đối chiếu status/ACK cùng seq. Giữ cửa mở để kiểm tra không lặp, rồi đóng, chờ phục hồi và chạy đợt thứ hai.

R2: quét thẻ hợp lệ, gạt OPEN trong cửa sổ cho phép và giữ quá 15000 ms mô phỏng. Đối chiếu uptime DOOR_OPENED/LEFT_OPEN_WARN, state DOOR_OPEN_AUTH, cảnh báo vàng và lịch sử R2. Kiểm tra không có command do R2 tạo. Giữ OPEN để kiểm tra không lặp, đóng/chờ LOCKED và chạy đợt thứ hai.

Kiểm tra mã sai 403, netoff/mã đúng 409, neton/state mới khôi phục status/ACK. `netoff` chứng minh nhánh offline. Muốn chứng minh stale khi còn online phải ngừng riêng dữ liệu state trong khi giữ MQTT kết nối; bài logic freshness không thay thế phép thử này.
