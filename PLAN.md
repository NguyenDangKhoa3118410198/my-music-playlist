# Kế hoạch tiếp theo, chia theo model

Nguyên tắc chọn model:

| Model | Dùng cho | Dấu hiệu |
|---|---|---|
| **Opus 5.5** | Việc khó, sai thì hỏng dữ liệu hoặc đồng bộ: thiết kế, SQL/RLS, Realtime, đồng bộ phát, refactor lớn, review bảo mật | Đụng `rooms.sql`, `useRoomRealtime`, `useSyncedPlayer`, nhiều người cùng thấy kết quả |
| **Sonnet 5.5** | Việc vừa, phạm vi rõ: component, UI/UX, viết test e2e, refactor một file | Chỉ đổi giao diện hoặc một màn hình, có test bao quanh |
| **Haiku 5.5** | Việc cơ học, làm theo mẫu có sẵn: chạy test và báo kết quả, đổi chữ, gom helper test, cập nhật README | Không cần quyết định thiết kế, sai thì test bắt ngay |

Quy ước chung cho mọi model: làm theo `CLAUDE.md` (một bộ nút, `ui/Dialog`, `ui/Menu`, biến màu ở `:root`), sửa lỗi thì thêm
test và cố ý phá để thấy test đỏ, mở popup/menu ra xem bằng mắt. Việc Opus làm xong thì nên để một phiên khác review.

## 1. Sửa lỗi đang có

| Việc | Model | Ghi chú |
|---|---|---|
| ✅ Xoá / đổi thứ tự hàng đợi bị trễ (xem `TODO.md`) | **Opus** | Cập nhật lạc quan + hoàn lại khi lỗi, phải giữ đúng thứ tự khi nhiều người thao tác cùng lúc. Test với `latencyMs` |
| Thử thật trên Supabase: emoji (Broadcast), yêu cầu đếm HEAD, kéo thả bằng ngón tay | **Sonnet** | Hai trình duyệt + một điện thoại thật; ghi lại kết quả, mở việc mới nếu có lỗi |

## 2. Code sạch, tái sử dụng, refactor

| Việc | Model | Chi tiết |
|---|---|---|
| ✅ Tách `src/pages/RoomPage.tsx` (645 dòng) | **Opus** | Tách hook `useRoomActions` (play/pause/seek/next/remove/reorder + xử lý xung đột phiên bản), `useTvMode` (toàn màn hình, wake lock, Esc), `useHeartbeat`. Trang chỉ còn ghép giao diện. Giữ nguyên hành vi, toàn bộ e2e phải xanh |
| ✅ Hàm chung "ai thêm bài" | **Haiku** | Cùng một đoạn `added_by === userId ? 'bạn' : … \|\| 'Khách'` lặp ở `QueuePanel`, `HistoryPanel`, `TvPanel`, `RoomPage`. Gom về `lib/roomPeople.ts` + unit test |
| ✅ Hook chép link dùng chung | **Haiku** | `navigator.clipboard` + trạng thái "Đã chép" lặp ở `RoomPage` và `InviteDialog` → `useCopyToClipboard` |
| ✅ Thay `window.confirm` bằng hộp thoại của app | **Sonnet** | 4 chỗ (`PlaylistView` xoá playlist/bài, `RoomPage` rời/đóng phòng). Làm `ui/ConfirmDialog` dựa trên `ui/Dialog`, trông đồng bộ với app, test được trên Playwright |
| Tách `PlayerBar.tsx` (484), `PlaylistView.tsx` (475), `SongForm.tsx` (374) | **Sonnet** | Mỗi file một phiên. Tách component con và hook, không đổi giao diện; so ảnh chụp trước/sau bằng `screenshots.spec.ts` |
| ✅ Gom helper cho test e2e | **Haiku** | `joinRoom` lặp ở 8 file spec, ép kiểu `window.__yt` lặp nhiều nơi → đưa vào `e2e/fixtures.ts` |
| Tách gói tải đầu (JS ~490 kB, gzip ~142 kB) | **Sonnet** | Lazy-load trang phòng và các hộp thoại ít dùng; đo lại bằng `npm run build` |

## 3. UI / UX

| Việc | Model | Chi tiết |
|---|---|---|
| Phần video dính trên cùng ở điện thoại quá cao | **Sonnet** | Video + điều khiển + emoji chiếm ~60% màn hình, danh sách chỉ còn ~3 dòng. Thử thu gọn khi cuộn (video nhỏ lại, ẩn thanh emoji) |
| Trạng thái rỗng / lỗi / đang tải còn lẫn lộn giữa các màn | **Sonnet** | Rà một lượt, dùng cùng một kiểu (`room-empty`, skeleton `.sk`) |
| Quét lại giao diện sau mỗi đợt thay đổi | **Haiku** | Chạy `screenshots.spec.ts`, liệt kê ảnh có chữ tràn, nút đè nhau; không tự sửa |
| Rà khả năng truy cập (bàn phím, nhãn, tương phản) | **Sonnet** | Đặc biệt kéo thả, menu, màn hình lớn |

## 4. Tính năng có thể làm

Xếp theo giá trị cho người dùng; việc nào cần quyết định của bạn thì ghi rõ.

| Tính năng | Model | Ghi chú |
|---|---|---|
| Tìm bài YouTube ngay trong app | **Opus** (thiết kế) → **Sonnet** (làm) | Cần YouTube Data API key và hạn mức (mỗi lần tìm tốn 100/10.000 đơn vị mỗi ngày). Nên gọi qua Supabase Edge Function để không lộ key. **Cần bạn quyết định** có dùng API key không |
| Dán link playlist YouTube để thêm cả loạt | **Sonnet** | Cũng cần API key; dùng lại `room_add_many` |
| Chat nhẹ trong phòng | **Opus** | Quyết định lưu hay không lưu (Broadcast như emoji thì không tốn database), giới hạn tần suất, chống spam |
| Bỏ phiếu bỏ qua bài | **Opus** | Cần SQL mới + quyền; đụng luồng `room_next` |
| Hiển thị lời bài hát / tone trong phòng | **Sonnet** | Dữ liệu tone, ghi chú đã có ở playlist; mang sang khi thêm từ playlist |

## 5. Phát hành

| Việc | Model | Ghi chú |
|---|---|---|
| Mở PR `feat/listening-room` → `main` và review | **Opus** review, **Haiku** viết mô tả PR | Review tập trung vào `rooms.sql` (quyền, RLS) và luồng đồng bộ |
| `npm audit` cảnh báo sau khi cài `qrcode` | **Haiku** | Đọc báo cáo, chỉ báo lại; nâng cấp nào phá vỡ thì hỏi trước |
| Theo dõi hạn mức Supabase Free (egress, tin Realtime) | **Haiku** | Ghi số liệu mỗi tuần vào một file; quá 50% thì báo |

## Thứ tự đề xuất

✅ = đã xong (bước 1, 3, 4 và `ConfirmDialog` ở bước 5).

1. Opus: sửa lag xoá/đổi thứ tự (đang làm phiền khi dùng).
2. Sonnet: thử thật trên Supabase + điện thoại.
3. Haiku: ba việc gom code nhỏ (ai thêm bài, chép link, helper e2e). Rủi ro thấp, làm song song được.
4. Opus: tách `RoomPage`. Làm sau bước 3 để ít xung đột file.
5. Sonnet: `ConfirmDialog`, thu gọn phần video trên điện thoại, tách các file lớn còn lại.
6. Quyết định về YouTube API key, rồi mới làm tìm bài trong app.
