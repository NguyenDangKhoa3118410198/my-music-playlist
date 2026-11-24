# TODO

## ~~Xoá bài và đổi thứ tự hàng đợi bị trễ~~ (đã sửa, chờ thử trên Supabase thật)

Đã làm: cập nhật lạc quan qua `mutateQueue` trong `src/hooks/useRoomRealtime.ts`. Danh sách đổi ngay trên máy mình,
máy chủ xử lý ở nền, lỗi thì hoàn lại và báo. Trong lúc thao tác chưa xong, kết quả tải hàng đợi cũ (Realtime, tải định kỳ)
bị bỏ qua để danh sách không giật ngược. Xoá bài **đang phát** vẫn đi đường cũ (để máy chủ chuyển bài).
Test: `e2e/room-queue-latency.spec.ts` (máy chủ giả chậm 1,5 giây).

Còn lại: thử trên Supabase thật (tab Network) xem còn trễ không; nếu còn thì trễ nằm ở chỗ khác (RPC chậm, Realtime chậm).
