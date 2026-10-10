# Cài đặt và chạy

[Về README](../README.md) · [Kết quả](results.md) · [Kiểm thử](testing.md) · [Lịch sử thay đổi](../CHANGELOG.md)

## Công cụ cần cài

| Công cụ | Dùng cho |
|---|---|
| Git | Clone repo |
| VS Code + PlatformIO IDE | Build firmware ESP32 |
| Wokwi for VS Code | Chạy mạch mô phỏng |
| Node.js và npm | Chạy middleware/Web |
| Python | Chỉ cần nếu dùng console trong `tools/` |

Khuyến nghị Node.js 24.x; Node-RED 5.0.7 trong lockfile yêu cầu Node.js từ 22.9.0. Xem [phiên bản Node được Node-RED hỗ trợ](https://nodered.org/docs/faq/node-versions).

PlatformIO IDE có sẵn Core; không cần tự tạo Python venv để build bằng extension. Xem [cài PlatformIO](https://docs.platformio.org/en/latest/integration/ide/vscode.html). Wokwi cần kích hoạt giấy phép cho extension theo [hướng dẫn Wokwi](https://docs.wokwi.com/vscode/getting-started), dùng `Wokwi: Request a new License` trong Command Palette.

## Clone và mở project

Trên trang GitHub của repo, chọn **Code**, sao chép URL rồi clone. Thay `<REPOSITORY_URL>` bằng URL thật:

```sh
git clone <REPOSITORY_URL> iot-rfid-door-lock
cd iot-rfid-door-lock
```

Trong VS Code chọn **File -> Open Folder** và mở chính thư mục vừa clone, nơi có `platformio.ini`. Không mở riêng `src/` hoặc `middleware/` khi build firmware.

## Chạy lần đầu

### 1. Chọn topic riêng nếu có nhiều bản chạy cùng lúc

Firmware và middleware mặc định cùng dùng BASE `iot/nhom25/door8/w4-927-a61c` trên `test.mosquitto.org:1883`. Nếu có người khác cũng chạy bản clone, chọn BASE riêng rồi sửa đồng bộ `include/network_config.h`, `middleware/core.js` và topic subscribe trong `middleware/generate_flow.js`. Đổi BASE trước khi build firmware và tạo flow. Nếu đổi broker, sửa cả cấu hình firmware và node broker trong generator.

### 2. Build firmware

Trong PlatformIO, chọn **Build** cho environment `esp32dev` và chờ `SUCCESS`. Nếu CLI đã có, có thể chạy tại gốc repo:

```sh
pio run
```

Build tạo `.pio/build/esp32dev/firmware.bin` và `firmware.elf`; `wokwi.toml` đã trỏ đến hai file này. Máy mới phải build vì repo không chứa cache hoặc binary. Wokwi không tự biên dịch firmware: xem [mô phỏng PlatformIO](https://docs.wokwi.com/vscode/platformio).

### 3. Cài và chạy middleware/Web

Mở terminal thứ hai tại gốc repo. Trên Windows PowerShell:

```powershell
cd middleware
npm.cmd ci
npm.cmd run flow
npm.cmd test
npm.cmd start
```

Trên macOS/Linux, dùng `npm` thay `npm.cmd`. Các script tương ứng chạy generator, test logic và launcher Node-RED của project. Không cần cài Node-RED toàn cục hoặc server frontend riêng.

- Web: [http://127.0.0.1:1880/door](http://127.0.0.1:1880/door).
- Editor: [http://127.0.0.1:1880/editor](http://127.0.0.1:1880/editor).
- Mã điều khiển: `middleware/operator_code.txt`, tự tạo lúc chạy lần đầu. Đọc file trên máy bạn rồi nhập vào ô mã trong Web; không đưa mã lên GitHub.
- Log mới: `runtime/history.jsonl` tại gốc repo, tự tạo khi flow ghi dữ liệu.

Chỉ cần `npm ci` khi cài lần đầu hoặc cần cài lại dependency theo lockfile. Dừng bằng `Ctrl+C` trước khi tạo lại flow hoặc khởi động lại.

### 4. Khởi động mô phỏng và thử

Trong Command Palette của VS Code chọn **Wokwi: Start Simulator**. Máy cần Internet để ESP32 mô phỏng và Node-RED kết nối broker công cộng.

1. Giữ công tắc cửa ở CLOSED; xem Serial để xác nhận trạng thái thay vì chỉ nhìn hướng gạt.
2. Chờ Web có dữ liệu trực tiếp và sẵn sàng; nhập mã điều khiển để bật nút.
3. Thử RFID bằng thẻ Blue/Green, quan sát servo chuyển từ 0° sang 90°. Nếu không mở cửa, firmware khóa lại sau 5 giây mô phỏng.
4. Thử **Đọc trạng thái**, rồi **Mở khóa** và xác nhận trong hộp thoại. Đọc ACK và quan sát servo; thông báo gửi thành công chưa xác nhận servo đã chuyển động.
5. Khi khóa đang LOCKED, chuyển công tắc cửa sang OPEN để quan sát báo động và cảnh báo `DOOR_FORCED`.

Web có thể mở ngay cả khi chưa chạy Wokwi; lúc đó nút điều khiển bị vô hiệu vì chưa có dữ liệu thiết bị. Không chạy Python console làm controller đồng thời với Web.

## Có cần venv không?

Luồng chính dùng PlatformIO và Node.js/npm, không cần tạo `.venv` của project. Python console trong `tools/` là công cụ chẩn đoán tùy chọn. Nếu dùng, tạo một môi trường ở gốc repo:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools\requirements.txt
cd tools
..\.venv\Scripts\python.exe -m unittest test_console
..\.venv\Scripts\python.exe mqtt_console.py
```

Trên macOS/Linux, dùng `python3 -m venv .venv` và `.venv/bin/python` thay đường dẫn Windows. Console có `--base`, `--host`, `--port`, `--log`; xem `--help`. Dependency hiện có là `paho-mqtt==2.1.0`. Không commit `.venv` hoặc log console.

## Khắc phục lỗi thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| `npm` / `node` không được nhận diện | Cài Node.js phù hợp, mở terminal mới; kiểm tra `node --version` |
| PowerShell chặn `npm.ps1` | Dùng `npm.cmd` như các lệnh trên |
| Thiếu flow hoặc Web chưa cập nhật | Chạy generator trong `middleware/`, rồi restart bằng launcher |
| Wokwi báo thiếu firmware | Build `esp32dev`, kiểm tra `.bin/.elf` đúng đường dẫn trong `wokwi.toml` |
| Web offline hoặc nút bị khóa | Kiểm tra broker/Internet, BASE đồng bộ, simulator đang chạy, state trực tiếp còn mới và mã đã nhập |
| HTTP 403 | Mã điều khiển không khớp file của middleware đang chạy |
| HTTP 409 | Đọc `error` trong phản hồi: action không hỗ trợ hoặc thiết bị chưa sẵn sàng |
| Cổng 1880 bị chiếm | Dừng Node-RED cũ; nếu đổi `uiPort` trong settings thì dùng URL mới |
