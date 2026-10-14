# Quản lý thẻ và quyền sử dụng

[Về README](../README.md) · [Hướng dẫn chạy](getting-started.md) · [Kiểm thử](testing.md)

Mở tab **Quản lý thẻ**, nhập mã điều khiển. Khi thiết bị trực tuyến và cấu hình đã được xác nhận, bạn có thể thêm/sửa thẻ, tắt/bật quyền hoặc xóa thẻ. Mỗi thay đổi có bước xác nhận trước khi gửi. Danh sách tối đa 8 thẻ; “Dùng UID vừa quét” điền mã từ lượt quét thực gần nhất, không tạo lượt quét giả.

## Chọn quyền

- Tên thẻ dùng để dễ nhận biết, tối đa 48 byte UTF-8; tên tiếng Việt có dấu tốn nhiều byte hơn số ký tự.
- Mã thẻ gồm 8, 14 hoặc 20 ký tự hex; không đăng ký trùng mã.
- **Cả ngày**, **Theo giờ mỗi ngày**, hoặc **Khách sạn · nhận 14:00, trả 12:00**. Với hai chế độ đầu, chọn các ngày trong tuần. Bỏ hết các ngày nghĩa là không có ngày được phép.
- Để trống ngày bắt đầu/hết hạn để không giới hạn. Ngày hết hạn gồm cả ngày đã chọn, theo UTC+7.
- Khung giờ qua đêm, ví dụ thứ Hai 22:00–02:00, bao gồm 00:00–02:00 thứ Ba của lượt bắt đầu thứ Hai. Giờ bắt đầu được tính, giờ kết thúc không được tính.

Quyền theo thời gian cần thiết bị đã đồng bộ giờ. Khi chưa biết giờ, thẻ có giới hạn ngày/giờ/hạn sử dụng bị từ chối; thẻ không giới hạn thời gian vẫn hoạt động. Khi mất Wi-Fi, ESP32 tiếp tục kiểm tra quyền đã lưu và đồng hồ đang chạy.

## Chọn giờ mỗi ngày

Ở chế độ **Theo giờ mỗi ngày**, bạn có thể nhập trực tiếp `08:30`, `8:30` hoặc `0830`; khi rời ô, Web chuẩn hóa thành `08:30`. Chỉ nhận giờ 00:00–23:59; giờ sai không được đưa vào quyền thẻ.

Bấm biểu tượng đồng hồ ở bên phải ô để mở bộ chọn. Chọn nhóm 00–11/12–23 giờ, giờ trên mặt đồng hồ, rồi phút (các mốc 5 phút). Nhập tay khi cần phút chính xác khác. **Áp dụng** đưa giờ vào form; **Hủy**, Escape hoặc bấm ra ngoài bỏ lựa chọn chưa áp dụng. Form vẫn cần **Lưu và đồng bộ** cùng bước xác nhận để đổi quyền trên thiết bị. Trên màn hình nhỏ, đồng hồ mở ở cạnh dưới màn hình để các nút luôn nhìn thấy được.

## Lưu trú khách sạn

Chọn chế độ **Khách sạn**, rồi chọn **Ngày nhận phòng** và **Ngày trả phòng**. Thẻ bắt đầu có quyền lúc 14:00 ngày nhận, hết quyền đúng 12:00 ngày trả, theo UTC+7. Thẻ hoạt động liên tục giữa hai mốc, kể cả qua đêm và khoảng 12:00–14:00 ở các ngày nằm giữa kỳ lưu trú; không tạo khoảng chặn mỗi ngày. Ngày trả phải sau ngày nhận. Web hiển thị bản xem trước trước khi bạn lưu/xác nhận; firmware kiểm tra hai mốc thời gian bằng chính sách hiện có.

Mỗi ô ngày có nút **×** để xóa ngay và **Xóa ngày** trong lịch. Nút tháng trước/sau hỗ trợ đi qua năm; có thể dùng mũi tên trên bàn phím để chọn ngày. Xóa ngày ở chế độ khách sạn đưa form về trạng thái chờ chọn đủ hai ngày; muốn quyền không có ngày hết hạn, chọn Cả ngày và để trống giới hạn.

## Xác nhận và lưu giữ

“Đã lưu yêu cầu” chỉ là middleware đã lưu cấu hình mong muốn. Web chỉ báo **đã lưu và áp dụng** khi thiết bị xác nhận cấu hình và trạng thái trực tiếp cùng phiên bản. Nếu mạng gián đoạn, yêu cầu đã được xác nhận trên Web chờ đồng bộ khi thiết bị trở lại; nút “Đồng bộ lại” thử lại yêu cầu đã lưu. Trang cũ phải tải cấu hình mới trước khi sửa tiếp, tránh ghi đè thay đổi từ trang khác.

Thiết bị lưu quyền trong NVS. Middleware giữ yêu cầu ở `runtime/card_policy.json`, được Git bỏ qua; clone mới không mang quyền riêng của máy này. Khi NVS chưa có cấu hình, mặc định có Blue `01020304` và Green `11223344`; lỗi đọc dữ liệu đã có sẽ chặn cấp quyền, không tự phục hồi các thẻ mặc định. Các thay đổi quyền không mở khóa cửa.

Thẻ hết hạn/bị tắt/ngoài giờ cũng là lượt bị từ chối; ba lượt liên tiếp theo chính sách hiện tại sẽ tạm ngưng RFID 10 giây mô phỏng. Web ghi lý do để phân biệt với thẻ chưa đăng ký. Giờ và timer mô phỏng có thể chạy chậm hơn giờ trên máy tính.

## Phạm vi kiểm tra hiện tại

Schema, xung đột phiên bản, lưu qua restart middleware, ACK chưa đủ để coi là áp dụng và quyền của API đã qua fixture. Firmware đã build, self-test các ranh giới thời gian/qua đêm/hết hạn đạt 10/10. Log Wokwi ghi nhận Blue bị từ chối vì hết hạn, sau khi cập nhật ngày hết hạn mới được cấp quyền và mở/đóng hợp lệ. Chưa xác minh mất điện phần cứng thật hoặc mọi lịch tuần bằng lượt quét thực; xem [Results](results.md).
