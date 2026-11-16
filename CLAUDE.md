# Quy tắc cho repo này

## Giao diện (theme tối)

- **Control native phải đọc được ở theme tối.** `<select>`, `<option>`, `<input type="date|time">`,
  `<input type="range">`... do trình duyệt vẽ popup, nên:
  - Không dùng nền trong suốt (`rgba`) cho `select`; luôn đặt `background-color` đục.
  - Luôn đặt `background-color` và `color` rõ ràng cho `select option`, `select optgroup`
    (đã có sẵn rule chung trong `src/styles.css`, đừng ghi đè bằng màu sáng trên nền sáng).
  - Giữ `color-scheme: dark` cho control native.
- Thêm bất kỳ control native mới nào thì **mở dropdown/popup ra xem bằng mắt** trước khi báo xong;
  chụp màn hình trang đóng không đủ vì popup không hiện trong đó.
- Màu mới dùng biến CSS ở `:root` (`--panel`, `--text`, `--primary`...), không hardcode.

## Hệ thiết kế (đồng bộ toàn app)

Hướng thiết kế: **ứng dụng nghe nhạc cho người dùng** (mềm, bo tròn, trong mờ), không phải bảng quản trị.
Tham khảo nhaccuatui.com. Không dùng thẻ thống kê màu, khối "Dữ liệu"/nút xoá phơi ngay ra trang.

- CSS nằm ở `src/styles/`: `tokens.css` (màu, bo góc, ô nhập mặc định), `components.css` (nút, chip, menu,
  hộp thoại), `app.css` (khung app, trang chủ, playlist), `player.css`, `room.css`, `auth.css`, `song-form.css`.
- **Một bộ nút duy nhất**: `.btn` (+ `btn-primary` / `btn-danger` / `btn-quiet`, cỡ `btn-sm` / `btn-lg`) và
  `.icon-btn` (+ `is-primary` / `is-active`, cỡ `icon-btn-sm` / `-lg` / `-xl`). Luôn bo tròn hết cỡ, cao ≥ 36px.
  Không tạo lớp nút mới; ô nhập dùng thẳng `<input>`/`<select>` (đã có kiểu chung trong `tokens.css`).
- Tìm kiếm dùng `ui/SearchField`, menu hành động dùng `ui/Menu`, mọi hộp thoại dùng `ui/Dialog`
  (vẽ qua portal ra `<body>`; nếu không, thanh phát/thanh tab sẽ đè lên). Bìa playlist dùng `ui/Cover`.
- Hành động phụ (xuất/nhập, xoá, sửa) đặt trong menu ba chấm, không phơi thành nút to ngoài trang.
- Điều hướng: thanh bên trên máy tính, thanh tab ở đáy trên điện thoại. Thanh phát chỉ hiện khi đang phát.

## Test

- `npm test`: test hàm thuần. `npm run e2e`: Playwright (Chrome có sẵn, backend và YouTube giả trong `e2e/support`,
  chạy cổng 5188, không đụng Supabase thật).
- Mỗi lỗi giao diện đã gặp có test chặn lại; sửa lỗi xong thì thêm test, và thử cố ý gây lại lỗi để chắc test đỏ.
- Xem bằng mắt: `SHOT_DIR=e2e/.results/after npm run e2e -- e2e/screenshots.spec.ts`.
