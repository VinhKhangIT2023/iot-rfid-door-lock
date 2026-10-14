# Đề xuất thao tác bằng giọng nói

[Về README](../README.md) · [Kiến trúc](architecture.md)

**Trạng thái: đề xuất, chưa triển khai.** Người dùng đang cân nhắc, phần đã được yêu cầu làm ngay là nhật ký Offline.

Hồ sơ tuần 1 đặt UC5 “voice mở khẩn” vào phạm vi nội bộ của nhóm, sau khi ghi nhận tích hợp mở rộng trong đề tài gốc là không bắt buộc. Vì vậy cần phân biệt kế hoạch nội bộ với điều kiện cốt lõi của bảng 10 tuần. R1/R2 đã đáp ứng hai rule hiện tại; voice có thể bổ sung như một cách nhập lệnh.

## Vị trí và cách dùng đề xuất

Thêm nút **Nói lệnh** cạnh khu điều khiển của dashboard. Trình duyệt xin quyền micro khi người dùng chủ động bấm; nhận dạng tiếng Việt và hiển thị câu đã nghe cùng thao tác tương ứng:

| Câu nói | Thao tác |
|---|---|
| “Mở khóa cửa” | Mở hộp xác nhận; phải có mã điều khiển và state trực tiếp mới, rồi người dùng xác nhận để gửi HTTP unlock |
| “Đọc trạng thái cửa” | Dùng đường status hiện có, đối chiếu ACK đúng session/seq |
| “Xem lịch sử cửa” | Chuyển sang tab Lịch sử cửa |
| “Xem hoạt động thẻ” | Chuyển sang tab RFID |

Luồng: micro trình duyệt → nhận dạng → ánh xạ câu cố định → UI/API hiện có → Node-RED → MQTT → ESP32. Micro đặt ở máy tính/điện thoại mở Web, không thêm micro vào mạch Wokwi. Giọng nói là phương thức nhập; quyền mở khóa vẫn được xác thực bằng cơ chế hiện có, không dựa trên nhận diện người nói.

Không có command điều khiển cánh cửa tự đóng trong mô hình hiện tại, nên không đưa “Đóng cửa” vào danh sách câu hỗ trợ. Câu chưa hiểu hoặc nhận nhầm chỉ hiển thị để người dùng sửa, không tự gửi lệnh.

## Tính khả thi

Nên làm ở mức tiện ích demo sau khi nhật ký Offline ổn định. Cách trên tận dụng Web đang có và không cần thêm tài khoản dịch vụ voice. `SpeechRecognition` chưa được hỗ trợ đồng đều giữa các trình duyệt; một số trình duyệt dùng dịch vụ nhận dạng từ xa và cần mạng. Cần thử trên trình duyệt thật, hiển thị trạng thái thiếu hỗ trợ/quyền micro và giữ các nút thao tác hiện có. [Tài liệu API trình duyệt](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Nếu cần đúng kịch bản Google Assistant/IFTTT ghi ở hồ sơ tuần 1 thì phải rà lại dịch vụ, tài khoản và đường kết nối vào API local; đó là hướng tích hợp khác, chưa được triển khai hay xác minh ở project này.
