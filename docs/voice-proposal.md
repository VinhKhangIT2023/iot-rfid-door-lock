# Thao tác bằng giọng nói trên Web

[Về README](../README.md) · [Hướng dẫn chạy](getting-started.md)

Đã triển khai tại khung **Thao tác bằng giọng nói** trên Tổng quan. Bấm **Nói lệnh**, cấp quyền micro nếu trình duyệt hỏi, nói một câu rồi chờ Web tự nhận; không cần bấm Dừng. Kết quả nhận dạng và thanh mức âm giúp biết micro có thu được tiếng.

| Câu nói | Thao tác |
|---|---|
| “Xem lịch sử cửa” | Chuyển tab Lịch sử cửa |
| “Xem hoạt động thẻ” | Chuyển tab Hoạt động RFID |
| “Xem quản lý thẻ” | Chuyển tab Quản lý thẻ |
| “Xem tổng quan” | Chuyển tab Tổng quan |
| “Đọc trạng thái cửa” | Về Tổng quan, gửi yêu cầu đọc trạng thái nếu có mã và thiết bị sẵn sàng |
| “Mở khóa cửa” | Mở hộp xác nhận; có mã điều khiển và dữ liệu trực tiếp mới, bấm xác nhận mới gửi lệnh |

Giọng nói là cách nhập thao tác, không xác thực người nói. Không có lệnh đóng cánh cửa vì mô hình chỉ điều khiển khóa; công tắc phản ánh vị trí cánh cửa. Câu không hiểu/âm thanh rỗng không gửi lệnh. Micro ở máy mở Web, không thêm micro vào mạch Wokwi.

Web dùng `SpeechRecognition` tiếng Việt. Khi dịch vụ trả kết quả cuối, xử lý ngay; với câu chuyển tab hoàn chỉnh và ổn định 700 ms từ kết quả tạm, có thể chuyển sớm. Câu mở khóa luôn chờ kết quả cuối và hộp xác nhận. Khi hết câu, Web tự kết thúc lượt nghe; có timeout 20 giây nếu dịch vụ treo. Audio dùng để đo mức âm trong trình duyệt, không được ghi vào file của project. Micro được nhả khi kết thúc/lỗi/rời trang.

## Nếu không nhận được tiếng

1. Khi nói, xem thanh mức âm và tên micro. Nếu không nhảy, kiểm tra phím/nút tắt micro trên máy, dây/tai nghe và Windows Settings → System → Sound → Input → Test your microphone.
2. Nếu Windows thu được nhưng Web không thu, kiểm tra quyền micro và thiết bị đầu vào được chọn trong trình duyệt. Bạn tự cấp quyền; ứng dụng không thay đổi thiết lập Windows.
3. Nếu đã thu âm nhưng báo lỗi dịch vụ/mạng/ngôn ngữ, thử Chrome hoặc Edge có hỗ trợ, kiểm tra Internet rồi thử lại. API nhận dạng chưa được hỗ trợ đồng đều và có thể dùng dịch vụ từ xa. [Tài liệu SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Kết quả ngày 14/10/2026

Logic câu lệnh, câu chưa hiểu, kết quả rỗng, lỗi quyền, timeout, nhận một lần và chuyển từ kết quả tạm đã qua fixture (engine giả lập). Lượt thật đầu không thu được tiếng vì micro máy người dùng đang tắt. Sau khi bật lại, người dùng xác nhận Web nhận tiếng, **tự chuyển đúng tab không cần Dừng** và **“Mở khóa cửa” hiện hộp xác nhận**, rồi hủy. Đây là xác nhận thao tác từ người dùng, không phải thử giọng giả hoặc tự mở khóa.

Hồ sơ tuần 1 nhắc voice mở khẩn/Google Assistant; bản này triển khai voice qua Web. Chưa tích hợp tài khoản Google Assistant/IFTTT hay mở khẩn tự động.
