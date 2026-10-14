# Nhận cảnh báo Telegram

[Về README](../README.md) · [Hướng dẫn chạy](getting-started.md)

Telegram bổ sung kênh nhận thông báo từ middleware: **R1 — cửa mở trái phép**, **R2 — cửa mở hợp lệ quá 15 giây mô phỏng**. Firmware, timer và thao tác RFID giữ nguyên. Bot trả lời `/start`, `/help`, `/status`, `/history` trong cuộc trò chuyện riêng đã cấu hình. Bàn phím có nút tiếng Việt **Trạng thái cửa**, **Lịch sử cửa**, **Hướng dẫn**; nội dung mô tả hoạt động bằng lời dễ hiểu, không in event/session/ID hoặc dòng log gốc.

## Thiết lập lần đầu

1. Mở [@BotFather](https://t.me/BotFather), dùng `/newbot` và làm theo hướng dẫn để lấy token. Mở cuộc trò chuyện riêng với bot vừa tạo, gửi `/start`.
2. Tại thư mục `middleware`, chạy:

   ```powershell
   npm.cmd run telegram:init
   ```

3. Điền token vào `botToken` trong `telegram.local.json`. Giữ `enabled: false`, `chatId: ""` khi chuẩn bị. File này được Git bỏ qua; template `telegram.example.json` không chứa thông tin riêng.
4. Chạy `npm.cmd run telegram:chats`. Kiểm tra đúng tên bot và chọn Chat ID của chính bạn. Nếu chưa thấy chat, gửi `/start` lại rồi chạy lệnh lại. Bản hiện tại hỗ trợ cuộc trò chuyện riêng.
5. Điền `chatId` dạng chuỗi và đổi `enabled` thành `true`. Chạy `npm.cmd run telegram:test`; kiểm tra tin thử trong Telegram. API nhận tin không chứng minh người nhận đã đọc.
6. Khi cập nhật code lần đầu: dừng middleware, chạy `npm.cmd run flow`, `npm.cmd test`, rồi `npm.cmd start`. Sau đó chạy Wokwi như bình thường. Không cần thêm dịch vụ bot hoặc dependency npm.

[Hướng dẫn tạo bot chính thức](https://core.telegram.org/bots/tutorial#obtain-your-bot-token) · [API lấy cuộc trò chuyện](https://core.telegram.org/bots/api#getupdates) · [API gửi tin](https://core.telegram.org/bots/api#sendmessage).

## Kiểm tra R1/R2

- **R1:** chờ LOCKED/CLOSED, mở công tắc cửa khi chưa cấp quyền. Web tạo cảnh báo đỏ; Telegram nhận thông báo mở trái phép. Đóng cửa và chờ phục hồi trước bài tiếp theo.
- **R2:** quét Blue, mở cửa trong cửa sổ 5 giây mô phỏng, giữ OPEN quá 15 giây mô phỏng. Web tạo lời nhắc vàng; Telegram nhận lời nhắc đóng cửa. Đóng cửa rồi mở hợp lệ ở đợt mới để kiểm tra lần tiếp theo.

Kênh cảnh báo trực tiếp chỉ gửi rule đã xác minh session. Dữ liệu retained, sự kiện cũ, ACK và thao tác mở khóa thông thường không tạo cảnh báo trực tiếp. Hàng đợi giới hạn 16 yêu cầu, một yêu cầu đang gửi; bỏ tin quá 60 giây PC và chống gửi lại cùng rule, không tự thử lại tin lỗi. Kênh [lịch sử gửi bù](offline-history.md) bổ sung riêng: bản tổng hợp quá khứ, outbox bền vững và retry khi lỗi; không kích hoạt lại cảnh báo/lệnh cũ.

Bot chỉ trả lời chủ sở hữu cuộc trò chuyện riêng đã cấu hình, bỏ qua lệnh cũ quá 5 phút; không có lệnh mở khóa từ Telegram. Không chạy `telegram:chats` đồng thời khi bot đang đọc lệnh để tránh tranh nhận cập nhật.

Thiết bị từng sẵn sàng rồi mất dữ liệu liên tục quá 30 giây sẽ có một tin mất kết nối; có dữ liệu mới thì gửi một tin phục hồi. Khi chủ động nghỉ, tắt **Thông báo mất kết nối** ở tab Kỹ thuật và lưu bằng mã điều khiển. Lựa chọn được giữ qua restart Web. Stop Wokwi cũng có thể tạo thông báo này nếu chưa tắt.

`enabled: false` tắt các thông báo tiếp theo mà không cần restart. Một yêu cầu đã gửi tới Telegram có thể hoàn thành. Middleware và mạng phải đang hoạt động; Stop Wokwi không tạo thêm cảnh báo cửa.

## Kết quả và xử lý lỗi

Log JSONL có hàng `telegram_delivery`: `api_accepted`, `failed`, `disabled`, `skipped` hoặc `closed`. Không ghi token/Chat ID vào hàng kết quả. `api_accepted` là API đã nhận yêu cầu.

| Tình huống | Cách kiểm tra |
|---|---|
| `/start` không có trả lời | Kiểm tra enabled/Chat ID, middleware đang chạy và flow mới; gửi lại `/start` sau khi dịch vụ sẵn sàng |
| Chưa thấy chat riêng | Kiểm tra đúng username bot, gửi `/start` mới rồi chạy lại |
| Token/Chat ID không hợp lệ | Kiểm tra file local, không điền vào template public |
| `telegram_401` | Token không được API chấp nhận |
| `telegram_403` | Kiểm tra bot bị chặn hoặc quyền gửi tới cuộc trò chuyện |
| `telegram_429` / `network_or_timeout` | Kiểm tra mạng, giới hạn gửi; không tự gửi lại cảnh báo đã lỗi |
| Có tin thử nhưng R1/R2 không gửi | Kiểm tra flow đã tạo lại/restart và rule thực đã xuất hiện ở Web/log |

13/13 bài Telegram giả lập và toàn bộ bộ test dự án đạt ngày 14/10/2026. Người dùng xác nhận thấy tin thử và cả hai tin cảnh báo thực:

| Bài thực | Kết quả |
|---|---|
| R1 lúc 15:04:02 UTC+7 | Event đúng phiên tạo rule; API nhận tin sau 947 ms; một hàng gửi; người dùng thấy tin |
| R2 lúc 15:05:58 UTC+7 | Cửa mở hợp lệ 15003 ms mô phỏng; API nhận tin sau 884 ms; một hàng gửi; người dùng thấy tin |
| Đóng cửa sau R2 | Khóa lại sau 5004 ms mô phỏng, về LOCKED/CLOSED |

Đây là một đợt thực cho mỗi rule trên máy hiện tại. Chống lặp, hàng đợi và lỗi API được kiểm tra thêm bằng fixture, không coi là các bài mất mạng Telegram thực.

Ngày 14/10/2026, người dùng xác nhận bot trả lời cả `/status` và `/history`. Bản trình bày tiếng Việt mới đã được API nhận vào đúng cuộc trò chuyện; kiểm thử chủ sở hữu, lệnh cũ, theo dõi kết nối và lỗi API nằm trong suite tính năng, không tính fixture là tin thực.
