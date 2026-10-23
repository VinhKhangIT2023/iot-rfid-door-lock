# Changelog

[Về README](README.md) · [Kết quả](docs/results.md) · [Kiểm thử](docs/testing.md)

Chỉ ghi thay đổi đã thực hiện. Project chưa có bản release được đánh số.

## 23/10/2026 — Hiển thị đầy đủ hoạt động cửa trên Web

- Tổng quan hiển thị sự kiện đã lưu từ RFID, mở khóa Web/giọng nói và lịch sử gửi bù; giữ nguồn lịch sử riêng với trạng thái cửa hiện tại.
- Diễn giải lịch sử bằng tiếng Việt, nhận diện rõ “Mở khóa từ Web”; thêm nút xóa toàn bộ bộ lọc và liên kết từ RFID đến lịch sử đầy đủ.
- Giữ nguyên dữ liệu gốc và cách chống trùng; không đổi firmware hoặc bộ đếm RFID trực tiếp.

## 14/10/2026 — Ô ngày và đồng hồ chọn giờ

- Đưa biểu tượng lịch về mép phải ô; nút xóa ngày nằm đúng vị trí khi có giá trị.
- Thêm đồng hồ chọn giờ/phút 24 giờ cho khung giờ mỗi ngày, cùng nhập tay HH:mm/HHmm và báo lỗi dữ liệu. Áp dụng/Hủy không tự lưu quyền thẻ.
- Kiểm tra trực tiếp chọn 09:30, nhập 1845→18:45, Hủy giữ giá trị, giờ sai chặn giá trị, chọn/xóa ngày; bộ test hiện tại 120 fixture cùng bộ kế thừa đạt (26 fixture tính năng). Giữ phạm vi một cửa theo quyết định người dùng.

## 14/10/2026 — Quản lý thẻ, bot tương tác và điều khiển giọng nói

- Thêm quản lý tối đa 8 thẻ trên Web; quyền ngày/giờ/hạn sử dụng lưu NVS, xác nhận lưu và áp dụng đúng phiên/revision; cần mã điều khiển và cấu hình trực tiếp trước khi sửa.
- Telegram trả lời trạng thái/lịch sử/hướng dẫn bằng nút tiếng Việt hoặc lệnh; thêm thông báo mất/kết nối lại, có thể tạm tắt khi nghỉ. Diễn giải hoạt động bằng lời, bỏ log kỹ thuật khỏi tin người dùng.
- Lịch sử tìm/lọc toàn bộ dữ liệu, phân trang, lọc ngày và xuất CSV. Ba nguồn Offline/gửi lại khi Online/trực tiếp không trùng nhau.
- Thêm quyền lưu trú khách sạn liên tục từ 14:00 ngày nhận đến 12:00 ngày trả; chặn thiếu/ngược ngày, có bản xem trước.
- Sửa menu và lịch đóng trước khi nhận cú bấm; nút × xóa ngày ở mọi lịch, chuyển tháng/năm bằng chuột và bàn phím; hỗ trợ chuột/bàn phím, lịch ngày riêng, giãn nhãn và ô nhập. Voice thành khung riêng, ô cửa gọn và hình cửa đặt giữa theo chiều cao.
- Voice nhận kết quả cuối hoặc câu chuyển tab ổn định mà không cần bấm dừng; mở khóa vẫn xác nhận. Có thanh mức âm, báo lỗi/rỗng/timeout và tự nhả micro. Logic đạt; sau khi bật lại micro, người dùng xác nhận tự chuyển tab và hộp xác nhận mở khóa.
- 24 fixture tính năng mới đạt, toàn bộ suite hồi quy đạt; firmware build và self-test chính sách 10/10. Các phạm vi thực và giới hạn được ghi riêng trong Results. Không làm thêm hồ sơ tuần 10.

## 14/10/2026 — Nhật ký Offline và gửi bù

- Lưu event ở NVS ESP32 theo ID boot/sequence, chờ xác nhận middleware đã lưu/fsync trước khi xóa; queue giới hạn, báo pending/capacity/health/dropped.
- Tách topic history/history_ack, chống lặp theo ID, giữ lịch sử qua restart Web; dữ liệu quá khứ không thay trạng thái hoặc kích hoạt rule/lệnh hiện tại.
- Tab Lịch sử cửa có tìm kiếm/lọc, phân biệt giờ xảy ra và giờ nhận; Telegram gửi bản tổng hợp quá khứ với outbox bền vững và retry lỗi có giới hạn nhịp.
- Bài Offline thực nhận đủ 9 sự kiện và người dùng thấy lịch sử Telegram; software reboot giữ/gửi lại 2 sự kiện NVS. Giới hạn Wokwi/watchdog và chưa thử mất điện phần cứng ghi trong Offline history.
- Tại mốc nhật ký Offline này, voice còn là đề xuất; xem bản triển khai và trạng thái mới ở mục phía trên.

## 14/10/2026 — Kênh cảnh báo Telegram tùy chọn

- Gửi R1/R2 đã xác minh phiên tới chat riêng; không thêm lệnh điều khiển cửa qua Telegram.
- Cấu hình local được Git bỏ qua, template trống; công cụ init/chats/test. Không tự trả lời `/start`.
- Hàng đợi giới hạn, chống lặp, bỏ tin cũ, timeout và log kết quả API không chứa token/Chat ID; không tự thử lại hoặc gửi bù.
- 13/13 fixture Telegram và toàn bộ test kế thừa đạt. Một đợt R1 và một đợt R2 từ Wokwi thật được API nhận; người dùng xác nhận thấy cả hai tin. R2 phát sau 15003 ms mô phỏng, đóng cửa khóa lại sau 5004 ms.

## 14/10/2026 — Kiểm thử hệ thống tuần 9

- Event/ACK retained, thiếu session hoặc khác state trực tiếp chỉ được lưu raw, không thay RFID/rule/ACK; từ chối state của 32 phiên đã nghỉ gần nhất trong bộ nhớ.
- Rule/RFID ghi event_session/session_verified. Phiên state mới xóa ACK cũ; HTTP 202 trả session, Web xác nhận cả seq/session và hủy pending khi đổi phiên.
- POST command JSON lỗi trả 400, body lớn hơn 2 KiB trả 413, sai Content-Type trả 415. Khai báo trực tiếp body-parser 1.20.8 đã có trong dependency và đồng bộ lockfile.
- Launcher in URL theo host/port settings. Thêm 14 test W9 và 6 test HTTP; cập nhật fixture cũ với session của firmware hiện tại.
- Hồi quy HTTP/MQTT, stale/offline/reconnect và thao tác RFID/R1/R2 thực; cài/build/Web bản sạch cùng máy. Chuẩn hóa tài liệu; firmware và timer không thay đổi, video/người chạy độc lập còn thiếu.

## 13/10/2026 — Tích hợp tuần 8

- Heartbeat firmware đổi từ 5s sang 1s mô phỏng, Wi-Fi chọn channel 6, loop nghỉ 5ms để giảm tải Wokwi. Freshness API giữ 12s PC và timer cửa giữ nguyên.
- State trực tiếp hợp lệ xác nhận lại online, tránh cờ availability offline lưu cũ làm Web chờ mãi dù đã nhận heartbeat mới. Retained state vẫn không cấp quyền.
- MQTT worker gắn session vào event/ACK khi publish. Thêm Serial-only stateoff/stateon để kiểm tra stale khi MQTT còn online.
- Thêm 11 fixture tích hợp và công cụ observe chỉ đọc API để ghi mốc PC/uptime/kết nối. Các kết quả E2E được ghi riêng trong Results, không suy từ fixture.

## 12/10/2026 — Dashboard và theo dõi RFID

- Thiết kế lại dashboard xanh đậm, minh họa cửa, trạng thái dễ đọc và ba tab Tổng quan/RFID/Kỹ thuật; hỗ trợ desktop/mobile.
- Tách HTML, CSS và JavaScript; generator nhúng tại chỗ, không thêm dependency frontend.
- Thêm lịch sử 100 sự kiện RFID, thống kê từ khi middleware khởi động, tìm UID/tên và lọc kết quả. Phân biệt cấp quyền, từ chối, bỏ qua khi khóa tạm và bắt đầu/kết thúc khóa tạm.
- Chỉ tính event RFID trực tiếp; không tính unlock REMOTE/SERIAL hoặc retained. Khóa tạm hiện tại lấy từ state còn mới.
- API phân biệt broker/device offline, chờ state và stale. Web đối chiếu ACK theo seq và tạm khóa nút khi chờ.
- Thêm 8 bài logic dashboard đạt, giữ nguyên 23 bài tuần 7 và bộ kiểm thử kế thừa. Phạm vi kiểm tra UI và Wokwi được ghi riêng trong Results.

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

## 14/10/2026 — Bổ sung sau kiểm tra sạch thực

- Tách label “Kết quả” khỏi các option để bộ lọc RFID có tên truy cập rõ; kiểm tra lại desktop/mobile.
- Launcher thử bind cổng trước spawn: báo rõ nếu đang có Web, không khởi động bản thứ hai; báo mã local trống và lỗi spawn.
- Cài/build/Wokwi/Web thực từ bản sạch trên cùng máy; kiểm tra giao diện, RFID/servo/rule, HTTP/mạng, Stop/Start và restart. Bộ kế thừa cùng 62 fixture đạt sau sửa; main được khôi phục và bản tạm đã dọn.
