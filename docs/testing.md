# Kiểm thử

[Về README](../README.md) · [Kết quả](results.md) · [Lịch sử thay đổi](../CHANGELOG.md)

## Test middleware

Tại `middleware/`:

```sh
node generate_flow.js
npm test
```

Test hiện có kiểm tra freshness, retained, offline, sequence, action, broker, chống lặp rule, cú pháp flow và nhánh HTTP 403/409/202. Đây là test logic offline, không kết nối thiết bị thật hoặc xác nhận servo.

Tuần 8 bổ sung `tests_w8.js` với 11 fixture tích hợp trên function HTTP thực của flow: payload command/session/seq, retained startup, 403/409/202, phục hồi offline, lỗi cờ availability lưu cũ, heartbeat idle và hợp đồng BASE/broker. `npm test` chạy cả bộ này; fixture không thay thế 10+10 chu kỳ hoặc chạy Wokwi 15 phút.

Firmware cần build bằng PlatformIO sau thay đổi tuần 8. Trước lấy evidence, Stop Wokwi rồi Start Simulator lại để nạp binary vừa build. Bài stale-online: gửi Serial `stateoff`, chờ API connection=stale và MQTT còn online, thử command để nhận 409, gửi `stateon` rồi kiểm tra state mới/status/ACK. `netoff` kiểm tra offline riêng. Chỉ gửi các lệnh chẩn đoán qua Serial forwarding cục bộ, không qua MQTT.

Quan sát 15 phút bằng `npm run observe -- --seconds=900 --output=../runtime/observation-01.jsonl`. File JSONL và summary giữ toàn bộ mẫu, không tự loại khoảng Offline. Quan sát API không chứng minh góc servo. Chọn tên file mới cho mỗi lần chạy.

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

## Hồi quy tuần 9 (14/10/2026)

`npm test` chạy bộ kế thừa, 23 bài W7, 8 bài dashboard, 11 bài W8, 14 bài W9 và 6 bài parser HTTP. Chạy riêng bằng `npm run test:w9` hoặc `npm run test:http`. Bài W9 kiểm tra event/ACK khác phiên, retained, chưa có state, state của phiên đã nghỉ, provenance rule/RFID và các function ACK/pending thật của dashboard. Bài HTTP gửi request tới server fixture cô lập; không publish telemetry lên broker.

Đã chạy lại HTTP/MQTT thật: 403/409/400/413/415; status/unlock 202 và ACK đúng session/seq; stale-online và netoff chặn 409; neton phiên mới phục hồi; firmware từ chối old_session, sequence lặp, action sai, JSON/schema sai. Người dùng thực hiện Blue→OPEN→R2→CLOSED→LOCKED, Red ba lần→Blue bị chặn, R1→đóng hết ALARM; middleware ghi rule/RFID có session đã đối chiếu. Đây là hồi quy log/API sau sửa, không có ảnh servo/ghi âm mới trong lượt W9.

Bản sạch cùng máy: npm ci, mọi bộ test, PlatformIO build và Web/API trên BASE/port riêng đạt; bản tạm đã được dọn. Không tính là người khác chạy hoặc E2E actuator trên máy khác. Video draft chưa có. Evidence chi tiết nằm ngoài repo ở folder Tuan09; repo vẫn chạy độc lập từ README.

## Kiểm tra sạch mở rộng

Ngày14/10/2026 đã chạy bản sạch cùng máy với Wokwi/UI thực, có ảnh servo và kiểm thử desktop/mobile, bộ lọc, dialog, HTTP/mạng/Stop-Start/restart. source firmware/diagram đối chiếu main, bin build sạch nạp qua đường dẫn simulator rồi khôi phục main đúng hash. Thẻ sai trong lượt sạch là Yellow55667788; Blue ignored kế thừa lượt người dùng W9 trước, không claim đã quét Red hoặc làm10+10 vòng mới. Kiểm tra sạch cùng máy hoàn tất; độc lập người khác là bổ sung, video chưa có.

## Telegram

`npm test` chạy thêm 13 fixture Telegram; `npm run test:telegram` chạy riêng, mọi request Telegram trong suite đều giả lập. Kiểm tra cấu hình tắt/sai, rule đúng phiên, chống lặp, hàng đợi, tin cũ, lỗi API, đóng node và wiring không thêm unlock. Không dùng token thật trong fixture.

Lượt thực ngày 14/10/2026: người dùng nhận tin thử, R1 và R2 do thao tác Wokwi tạo; đối chiếu event→rule đúng session→telegram_delivery API nhận thành công. Mỗi rule một đợt, người dùng xác nhận thấy tin. Chưa kiểm tra mất mạng Telegram thực. [Cách thiết lập và thử lại](telegram.md).

## Nhật ký Offline

`npm test` chạy thêm 19 bài `tests_history.js`; chạy riêng bằng `npm run test:history`. Kiểm thử file/fsync/restart/partial-write thật trên thư mục tạm; HTTP Telegram hoàn toàn giả lập. Tách dữ liệu cũ khỏi trạng thái/rule/điều khiển hiện tại; chỉ receipt sau lưu thành công, chống lặp ID, retry outbox và receipt không tạo vòng ACK.

Wokwi thực: netoff/R1/Blue→OPEN→R2→CLOSED/neton lưu và ACK đủ 9 sự kiện, Telegram được người dùng xác nhận đầy đủ. Software reboot giữ/gửi lại 2 sự kiện NVS; log có thêm reset watchdog của mô phỏng rồi phục hồi. Restart Node-RED giữ 13 bản ghi/ID, không gửi lại lịch sử đã xác nhận. Tab lịch sử/tìm UID/lọc Offline/empty được kiểm tra thực, không có lỗi JavaScript. Chưa thử mất điện phần cứng, ghi đầy NVS/RAM thực hoặc mất mạng Telegram thực; xem [phạm vi](offline-history.md).

## Bộ tính năng cuối tuần 9

`npm run test:features` chạy 24 fixture: schema/quyền thẻ, lưu cấu hình qua restart, ACK/áp dụng/xung đột phiên, xác thực API, nguồn lịch sử không trùng, lọc ngày/phân trang/CSV, bot chủ sở hữu/lệnh cũ/kết nối và voice lỗi/kết quả tạm/cuối. Toàn suite có 118 fixture W7–W9/dashboard/HTTP/Telegram/history/features cùng bộ kế thừa; speech engine và HTTP Telegram trong fixture được giả lập.

Wokwi build firmware có chính sách NVS; Serial `policytest` chạy 10 kiểm tra bằng thời gian giả định trên firmware thật, không sửa quyền hoặc điều khiển khóa. Lượt quét thật xác nhận Blue bị từ chối vì hết hạn, cập nhật lại có quyền rồi mở/đóng/R2. Web kiểm tra dropdown chuột/bàn phím, chọn ngày, khung giờ, nguồn lịch sử/CSV và desktop/mobile. Người dùng xác nhận voice tự chuyển tab và hiện xác nhận mở khóa sau bật lại micro. [Kết quả và giới hạn](results.md).

Bổ sung ô giờ sau phản hồi 14/10/2026: suite hiện tại 120 fixture (26 features). Chuẩn hóa 1.440 mốc HH:mm, từ chối giờ sai; UI thật kiểm tra chọn giờ/phút, nhóm sáng/chiều, Áp dụng/Hủy, nhập 1845→18:45, lỗi 99:99, chọn/xóa ngày, vị trí icon và popup đầy đủ nút trên màn hình nhỏ. Không thay quyền thẻ khi chỉ thao tác form.
