# Karaoke Playlist

Web app mobile-first để lưu danh sách bài hát karaoke, đăng nhập bằng Supabase, chia sẻ playlist bằng link mời và quản lý quyền `owner`, `editor`, `viewer`.

## Chạy local

1. Tạo Supabase project.
2. Chạy SQL trong `supabase/schema.sql` bằng Supabase SQL Editor.
3. Copy `.env.example` thành `.env` và điền:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Cài dependency và chạy app:

```bash
npm install
npm run dev
```

## Tính năng

- Đăng ký, đăng nhập, đăng xuất.
- Tạo playlist cá nhân hoặc chia sẻ.
- Thêm, sửa, xóa bài hát karaoke.
- Gắn link YouTube, tone, tag, ghi chú và yêu thích.
- Tìm kiếm, lọc theo trạng thái, mở YouTube.
- Mời người khác bằng link với quyền `editor` hoặc `viewer`.
- Import/export JSON theo từng playlist.
