# Kiểm thử

[Về README](../README.md) · [Kết quả](results.md) · [Lịch sử thay đổi](../CHANGELOG.md)

## Test middleware

Tại `middleware/`:

```sh
node generate_flow.js
node tests.js
```

Test hiện có kiểm tra freshness, retained, offline, sequence, action, broker, chống lặp rule, cú pháp flow và nhánh HTTP 403/409/202. Đây là test logic offline, không kết nối thiết bị thật hoặc xác nhận servo.

Sau khi sửa `application/index.html` hoặc generator, dừng middleware, tạo lại flow và khởi động lại. `flows.json` chứa HTML và đường dẫn log của máy đang chạy, nên được sinh tại chỗ và không commit. Nếu sửa flow trong editor, đưa thay đổi về generator trước khi tạo lại để tránh mất thay đổi. Sau khi sửa firmware, build lại rồi restart mô phỏng.

## Các tình huống đã thử trong mô phỏng

Xem [bảng kết quả mô phỏng](results.md#kiểm-thử-mô-phỏng-ngày-09102026). Để chạy lại, thực hiện bước thử RFID/Web trong [hướng dẫn chạy](getting-started.md#4-khởi-động-mô-phỏng-và-thử), sau đó kiểm tra thêm mã sai, netoff/neton và cảnh báo. Lệnh Serial `netoff`/`neton` tạm dừng/phục hồi mạng của mô hình.

Ghi riêng kết quả mới, ngày chạy và phiên bản source; kết quả lịch sử tuần 6 không tự trở thành kết quả của phiên bản sau.
