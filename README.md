# Karaoke Playlist

Web app mobile-first để lưu bài hát karaoke, nghe nhạc từ YouTube và **nghe chung theo thời gian thực** với bạn bè. Đăng nhập bằng Supabase, chia sẻ playlist bằng link mời, phân quyền `owner` / `editor` / `viewer`.

## Tính năng

- Đăng ký, đăng nhập, đăng xuất. Tạo playlist, thêm/sửa/xoá bài, gắn link YouTube, tone, thẻ, ghi chú, yêu thích.
- Khám phá, Thư viện, Yêu thích, tìm kiếm toàn cục; thanh phát nhạc cố định (chỉ hiện khi đang phát).
- Mời người khác vào playlist bằng link với quyền `editor` hoặc `viewer`; nhập/xuất JSON theo playlist.
- **Phòng nghe chung:** tạo phòng, mời bằng mã/link (khách vào bằng đăng nhập ẩn danh), hàng đợi chung,
  phát/tạm dừng/tua đồng bộ giữa mọi người, vai trò chủ phòng/DJ/người nghe, tắt tiếng riêng trên máy mình.
  - **Đã phát:** lịch sử các bài đã phát hoặc bị bỏ qua (kèm lý do), bấm để thêm lại vào hàng đợi.
  - **Thêm playlist vào phòng**, hoặc bấm "Nghe cùng bạn bè" ở trang playlist để tạo phòng nạp sẵn playlist đó.
  - **Đổi thứ tự hàng đợi:** chủ phòng/DJ dùng menu trên từng bài ("Phát tiếp theo", "Đưa lên", "Đưa xuống").
  - **Mời bằng mã QR** (menu ba chấm của phòng) và **chế độ màn hình lớn**: video to, mã QR để mọi người quét vào
    thêm bài từ điện thoại, danh sách bài tiếp theo. Dùng khi một máy nối TV/loa.
  - **Thả cảm xúc** (👏 ❤️ 🔥 😂 🎤) bay lên trên video của cả phòng. Gửi qua Realtime Broadcast, không lưu vào
    database; mỗi máy tối đa ~3 lần/giây để không vượt hạn mức tin nhắn của gói Free.
  - **Vòng đời phòng:** rời phòng, đóng phòng (chủ phòng), "Phòng gần đây" ở trang chủ. Phòng bỏ hoang tự tạm
    dừng tại chỗ người cuối cùng nghe tới, và tự đóng sau 7 ngày không ai dùng (xoá hẳn sau 30 ngày kể từ lúc đóng).

## Cấu hình Supabase

1. Tạo Supabase project (hoặc dùng project có sẵn).
2. Chạy SQL trong **SQL Editor**:
   - **Project mới:** chạy `supabase/schema.sql`, rồi `supabase/rooms.sql`.
   - **Project đã có sẵn bảng playlist:** chỉ chạy `supabase/rooms.sql` (không chạy `schema.sql`).
   - `rooms.sql` chạy lại nhiều lần được. **Khi cập nhật app lên bản mới, hãy chạy lại `rooms.sql`** để có các hàm mới
     (lịch sử, thêm hàng loạt, nhịp tim, rời/đóng phòng).
   - Tuỳ chọn: bật **pg_cron** (Database -> Extensions) rồi chạy lại `rooms.sql` để tự dọn phòng cũ mỗi ngày. Không bật
     thì mọi thứ vẫn chạy, chỉ là phòng không dùng sẽ nằm lại trong database.
3. **Authentication → Sign In / Providers:** bật **Allow anonymous sign-ins** (để khách vào phòng không cần tài khoản).
4. Lấy **Project URL** (`https://xxxx.supabase.co`, không có `/rest/v1`) và **publishable key** (`sb_publishable_...`)
   ở Project Settings → API Keys. **Tuyệt đối không dùng secret key / `service_role`** trong app này.

## Chạy local

```bash
cp .env.example .env     # rồi điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Test

```bash
npm test          # test hàm thuần (đồng bộ phát, kiểm tra cấu hình)
npm run e2e       # Playwright: dùng Chrome có sẵn, backend Supabase và YouTube giả, cổng 5188
npm run test:sql  # test SQL trên Postgres thật trong Docker (cần Docker; kéo image postgres:16-alpine lần đầu)
```

Test e2e không chạm Supabase thật nên chạy được mà không cần `.env`.

## Deploy lên Vercel

1. Import repo vào Vercel (Vite được nhận tự động: `npm run build`, thư mục `dist`). Chọn Node.js **22.x**.
2. **Settings → Environment Variables**, thêm cho cả **Production và Preview**:

   | Tên | Giá trị |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | publishable key |

   Giữ nguyên tiền tố `VITE_` (không bỏ), vì Vite chỉ đưa biến `VITE_*` vào app. Đây là hai giá trị **công khai
   theo thiết kế**, nên chọn loại **Config** nếu Vercel hỏi. Biến chỉ được nhúng **lúc build**: sửa biến xong phải **Redeploy**.
3. **Supabase → Authentication → URL Configuration:** đặt **Site URL** và **Redirect URLs** là domain Vercel của bạn.
4. `vercel.json` đã có sẵn, chuyển mọi đường dẫn (`/room/...`, `/join/...`) về `index.html` để F5 không bị 404.

### Build chặn bản hỏng

`npm run build` **dừng và báo lỗi rõ ràng** nếu `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` bị thiếu, còn là giá trị
mẫu, URL có đuôi `/rest/v1`, hoặc là **khoá bí mật** (`sb_secret_...`, `service_role`). Nhờ vậy Vercel không đưa bản
thiếu cấu hình lên chạy: build thất bại thì **bản cũ vẫn tiếp tục phục vụ người dùng**, và bạn xem lý do ở Build Logs.

Chỉ khi cố ý build mà không có backend (ví dụ CI chỉ để kiểm tra biên dịch) mới đặt `SKIP_ENV_CHECK=1`.

### Lưu ý

- Supabase gói Free **tự tạm dừng** khi không dùng một thời gian; khi đó app báo lỗi kết nối cho tới khi bạn resume project.
- Phát nhạc dùng YouTube embed nên iOS có thể dừng khi khoá màn hình, và một số video không cho nhúng sẽ bị bỏ qua.
