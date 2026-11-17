\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@x.com');
grant select, insert, update, delete on all tables in schema public to authenticated;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  c constant uuid := '00000000-0000-0000-0000-00000000000c';
  d constant uuid := '00000000-0000-0000-0000-00000000000d';
  r public.rooms; rid uuid; st public.room_state; q public.room_queue;
  res jsonb; n int; x double precision; items jsonb; cur uuid; v0 int; rcode text; rid2 uuid;
begin
  -- ================= LỊCH SỬ =================
  perform t.as_user(a);
  select * into r from public.create_room('Lịch sử'); rid := r.id;
  perform public.room_add(rid, 'vidAAAAAA01', 'https://youtu.be/vidAAAAAA01', 'Bài 1');
  perform public.room_add(rid, 'vidAAAAAA02', 'https://youtu.be/vidAAAAAA02', 'Bài 2');
  perform public.room_add(rid, 'vidAAAAAA03', 'https://youtu.be/vidAAAAAA03', 'Bài 3');

  select current_queue_id into cur from public.room_state where room_id = rid;
  perform public.room_next(rid, cur, 'ended');
  select count(*) into n from public.room_queue where room_id = rid and status = 'played' and finished_at is not null and end_reason = 'ended';
  perform t.check('lịch sử: bài hết tự nhiên được lưu (played, ended, có finished_at)', n = 1);

  select current_queue_id into cur from public.room_state where room_id = rid;
  perform public.room_next(rid, cur, 'skip');
  select count(*) into n from public.room_queue where room_id = rid and status = 'skipped' and end_reason = 'skip';
  perform t.check('lịch sử: bài bị bỏ qua bằng tay lưu lý do skip', n = 1);

  select current_queue_id into cur from public.room_state where room_id = rid;
  perform public.room_next(rid, cur, 'unplayable');
  select count(*) into n from public.room_queue where room_id = rid and status = 'skipped' and end_reason = 'unplayable';
  perform t.check('lịch sử: bài lỗi không nhúng được lưu lý do unplayable', n = 1);

  select * into st from public.room_state where room_id = rid;
  perform t.check('lịch sử: hết bài thì phòng về idle', st.status = 'idle' and st.current_queue_id is null);
  select count(*) into n from public.room_queue where room_id = rid and status in ('played','skipped');
  perform t.check('lịch sử: người trong phòng đọc được cả 3 bài', n = 3);

  perform t.as_user(c);
  select count(*) into n from public.room_queue where room_id = rid;
  perform t.check('lịch sử: người ngoài phòng không đọc được', n = 0);
  perform t.as_admin();

  -- bài bị xoá thủ công khỏi hàng đợi không thành lịch sử
  perform t.as_user(a);
  perform public.room_add(rid, 'vidAAAAAA04', 'https://youtu.be/vidAAAAAA04', 'Bài 4');
  perform public.room_add(rid, 'vidAAAAAA05', 'https://youtu.be/vidAAAAAA05', 'Bài 5');
  select id into cur from public.room_queue where room_id = rid and video_id = 'vidAAAAAA05';
  perform public.room_remove(rid, cur);
  select count(*) into n from public.room_queue where room_id = rid and video_id = 'vidAAAAAA05';
  perform t.check('xoá bài đang chờ thì bỏ hẳn, không thành lịch sử', n = 0);

  -- giới hạn 100 bài lịch sử
  perform t.as_admin();
  insert into public.room_queue (room_id, video_id, youtube_url, title, added_by, position, status, finished_at, end_reason)
  select rid, 'vidOLD' || lpad(g::text, 5, '0'), 'https://youtu.be/x', 'Cũ ' || g, a, g, 'played', now() - (g || ' minutes')::interval, 'ended'
  from generate_series(1, 120) g;
  perform t.as_user(a);
  select current_queue_id into cur from public.room_state where room_id = rid;
  perform public.room_next(rid, cur, 'ended');
  perform t.as_admin();
  select count(*) into n from public.room_queue where room_id = rid and status in ('played','skipped');
  perform t.check('lịch sử giới hạn tối đa 100 bài mỗi phòng (còn ' || n || ')', n <= 100);

  -- ================= room_add: kiểm tra id =================
  perform t.as_user(a);
  perform t.throws('room_add từ chối video id sai định dạng', format($f$select public.room_add(%L, 'a b!', 'u', 't')$f$, rid), 'Link video không hợp lệ%');

  -- ================= THÊM HÀNG LOẠT =================
  select * into r from public.create_room('Hàng loạt'); rid := r.id; rcode := r.code;
  select jsonb_agg(jsonb_build_object('video_id', 'vidMANY' || lpad(g::text, 4, '0'), 'title', 'Bài ' || g, 'url', 'http://evil.example/x')) into items from generate_series(1, 8) g;
  res := public.room_add_many(rid, items);
  perform t.check('thêm hàng loạt: chủ phòng thêm 8 bài', (res ->> 'added')::int = 8, res::text);
  select * into st from public.room_state where room_id = rid;
  perform t.check('thêm hàng loạt: hàng đợi trống thì bài đầu tự phát', st.status = 'playing');
  select count(*) into n from public.room_queue where room_id = rid and status = 'playing';
  perform t.check('thêm hàng loạt: đúng 1 bài playing + 7 chờ', n = 1 and (select count(*) from public.room_queue where room_id = rid and status = 'queued') = 7);
  perform t.check('thêm hàng loạt: ghi đúng vị trí tăng dần', (select count(distinct position) from public.room_queue where room_id = rid) = 8);
  perform t.check('thêm hàng loạt: url do server dựng, không tin url client gửi', (select count(*) from public.room_queue where room_id = rid and youtube_url like 'https://youtu.be/%') = 8);

  res := public.room_add_many(rid, '[{"video_id":"vidMANY0001","title":"Trùng 1"},{"video_id":"vidMANY0002","title":"Trùng 2"},{"video_id":"vidMANY0099","title":"Mới"}]'::jsonb);
  perform t.check('thêm hàng loạt: bỏ qua bài trùng (đang chờ/đang phát)', (res ->> 'skipped_duplicate')::int = 2 and (res ->> 'added')::int = 1, res::text);
  res := public.room_add_many(rid, '[{"video_id":"vidSAMEINB1","title":"A"},{"video_id":"vidSAMEINB1","title":"A lặp"}]'::jsonb);
  perform t.check('thêm hàng loạt: trùng ngay trong cùng một lần cũng bị bỏ', (res ->> 'added')::int = 1 and (res ->> 'skipped_duplicate')::int = 1, res::text);
  res := public.room_add_many(rid, '[{"video_id":"x","title":"Sai id"},{"video_id":"vidOKOKOK01","title":"   "},{"title":"Thiếu id"}]'::jsonb);
  perform t.check('thêm hàng loạt: đếm đúng bài sai định dạng', (res ->> 'skipped_invalid')::int = 3 and (res ->> 'added')::int = 0, res::text);
  perform t.throws('thêm hàng loạt: quá 100 bài bị từ chối', format($f$select public.room_add_many(%L, (select jsonb_agg(jsonb_build_object('video_id','vidBIG%s','title','t')) from generate_series(1,101) g))$f$, rid, '"||g||"'), null);
  perform t.throws('thêm hàng loạt: dữ liệu không phải mảng bị từ chối', format($f$select public.room_add_many(%L, '{"a":1}'::jsonb)$f$, rid), 'Danh sách bài không hợp lệ%');

  -- người nghe bị giới hạn 5 bài chờ, DJ thì không
  perform t.as_user(b);
  perform public.join_room(rcode);
  select jsonb_agg(jsonb_build_object('video_id', 'vidLIST' || lpad(g::text, 4, '0'), 'title', 'L' || g)) into items from generate_series(1, 8) g;
  res := public.room_add_many(rid, items);
  perform t.check('thêm hàng loạt: người nghe chỉ thêm được 5, còn lại báo skipped_limit', (res ->> 'added')::int = 5 and (res ->> 'skipped_limit')::int = 3, res::text);
  perform t.as_user(a);
  perform public.room_set_role(rid, b, 'dj');
  perform t.as_user(b);
  select jsonb_agg(jsonb_build_object('video_id', 'vidDJDJ' || lpad(g::text, 4, '0'), 'title', 'D' || g)) into items from generate_series(1, 8) g;
  res := public.room_add_many(rid, items);
  perform t.check('thêm hàng loạt: DJ không bị giới hạn', (res ->> 'added')::int = 8, res::text);

  perform t.as_user(c);
  perform t.throws('thêm hàng loạt: người ngoài phòng bị từ chối', format($f$select public.room_add_many(%L, '[{"video_id":"vidOUTSIDE1","title":"x"}]'::jsonb)$f$, rid), '%không ở trong phòng%');

  -- ================= NHỊP TIM + TỰ TẠM DỪNG =================
  perform t.as_user(a);
  select * into r from public.create_room('Phòng bỏ hoang'); rid := r.id; rcode := r.code;
  perform public.room_add(rid, 'vidIDLE0001', 'https://youtu.be/vidIDLE0001', 'Bài đang phát');
  perform t.as_user(b);
  perform public.join_room(rcode);

  -- A rời lúc 10 phút sau khi bài bắt đầu; 1 giờ sau B vào lại
  perform t.as_admin();
  update public.room_state set anchor_pos = 10, anchor_at = now() - interval '60 minutes', updated_at = now() - interval '60 minutes' where room_id = rid;
  delete from public.room_activity where room_id = rid;
  insert into public.room_activity (room_id, user_id, last_seen) values (rid, a, now() - interval '50 minutes');
  select version into v0 from public.room_state where room_id = rid;

  perform t.as_user(b);
  st := public.room_settle(rid);
  perform t.check('tự tạm dừng: lâu không ai nghe thì paused', st.status = 'paused', st::text);
  perform t.check('tự tạm dừng: đúng vị trí người cuối nghe tới (10s + 600s)', st.anchor_pos between 609 and 611, 'anchor_pos=' || st.anchor_pos);
  perform t.check('tự tạm dừng: tăng version để mọi máy cập nhật', st.version = v0 + 1);

  st := public.room_settle(rid);
  perform t.check('tự tạm dừng: gọi lại là idempotent, không đổi gì', st.version = v0 + 1 and st.status = 'paused');

  -- còn người hoạt động gần đây thì không dừng
  perform t.as_admin();
  update public.room_state set status = 'playing', anchor_pos = 10, anchor_at = now() - interval '60 minutes', updated_at = now() - interval '60 minutes' where room_id = rid;
  update public.room_activity set last_seen = now() - interval '30 seconds' where room_id = rid;
  perform t.as_user(b);
  st := public.room_settle(rid);
  perform t.check('còn người ping 30 giây trước thì giữ nguyên đang phát', st.status = 'playing', st::text);

  -- chưa ai ping bao giờ: dùng updated_at
  perform t.as_admin();
  delete from public.room_activity where room_id = rid;
  update public.room_state set anchor_pos = 42, anchor_at = now() - interval '3 hours', updated_at = now() - interval '3 hours' where room_id = rid;
  perform t.as_user(b);
  st := public.room_settle(rid);
  perform t.check('không có nhịp tim nào: dừng tại vị trí đã lưu, không chạy tiếp', st.status = 'paused' and st.anchor_pos between 41.9 and 42.1, 'anchor_pos=' || st.anchor_pos);

  -- vào lại bằng mã (join_room) cũng dọn trạng thái cũ
  perform t.as_admin();
  update public.room_state set status = 'playing', anchor_pos = 5, anchor_at = now() - interval '2 hours', updated_at = now() - interval '2 hours' where room_id = rid;
  delete from public.room_activity where room_id = rid;
  perform t.as_user(c);
  perform public.join_room(rcode);
  select * into st from public.room_state where room_id = rid;
  perform t.check('join_room dọn phòng bỏ hoang: người mới vào thấy paused thay vì "phát" ma', st.status = 'paused');

  -- ping
  perform t.as_user(b);
  perform public.room_ping(rid);
  perform t.as_admin();
  perform t.check('room_ping ghi nhịp tim', exists (select 1 from public.room_activity where room_id = rid and user_id = b and last_seen > now() - interval '5 seconds'));
  perform t.as_user(b);
  select count(*) into n from public.room_activity;
  perform t.check('client không đọc được bảng room_activity (không có policy)', n = 0);
  perform t.as_user(d);
  perform public.room_ping(rid);
  perform t.as_admin();
  perform t.check('người ngoài phòng ping không ghi gì', not exists (select 1 from public.room_activity where user_id = d));

  -- ================= RỜI / ĐÓNG PHÒNG =================
  perform t.as_user(a);
  select * into r from public.create_room('Rời phòng'); rid := r.id; rcode := r.code;
  perform t.as_user(b); perform public.join_room(rcode);
  perform t.as_user(d); perform public.join_room(rcode);
  perform t.as_user(a); perform public.room_set_role(rid, d, 'dj');

  perform t.as_user(b); perform public.room_ping(rid);
  perform public.room_leave(rid);
  perform t.as_admin();
  perform t.check('rời phòng: người nghe bị xoá khỏi danh sách thành viên và hoạt động', not exists (select 1 from public.room_members where room_id = rid and user_id = b) and not exists (select 1 from public.room_activity where room_id = rid and user_id = b));
  perform t.check('rời phòng: phòng vẫn mở', (select closed_at is null from public.rooms where id = rid));

  perform t.as_user(a); perform public.room_leave(rid);
  perform t.as_admin();
  perform t.check('chủ phòng rời: quyền host chuyển cho DJ', (select role from public.room_members where room_id = rid and user_id = d) = 'host' and (select owner_id from public.rooms where id = rid) = d);
  perform t.check('chủ phòng rời: phòng vẫn mở vì còn người', (select closed_at is null from public.rooms where id = rid));

  perform t.as_user(d); perform public.room_leave(rid);
  perform t.as_admin();
  perform t.check('người cuối rời: phòng tự đóng', (select closed_at is not null from public.rooms where id = rid));
  perform t.check('người cuối rời: trạng thái phát về idle', (select status from public.room_state where room_id = rid) = 'idle');
  perform t.as_user(c);
  perform t.throws('phòng đã đóng: không vào lại được', format('select public.join_room(%L)', rcode), '%đã đóng%');
  perform t.as_user(c);
  perform public.room_leave(rid); -- người không phải thành viên: không lỗi
  perform t.check('rời phòng khi không phải thành viên: không làm gì, không lỗi', true);

  -- đóng phòng
  perform t.as_user(a);
  select * into r from public.create_room('Đóng phòng'); rid := r.id; rcode := r.code;
  perform public.room_add(rid, 'vidCLOSE001', 'https://youtu.be/vidCLOSE001', 'Đang phát');
  perform t.as_user(b); perform public.join_room(rcode);
  perform t.throws('đóng phòng: người nghe không đóng được', format('select public.room_close(%L)', rid), 'Chỉ host%');
  select version into v0 from public.room_state where room_id = rid;
  perform t.as_user(a); perform public.room_close(rid);
  perform t.as_admin();
  select * into st from public.room_state where room_id = rid;
  perform t.check('đóng phòng: closed_at được đặt, phát dừng, version tăng', (select closed_at is not null from public.rooms where id = rid) and st.status = 'idle' and st.version = v0 + 1);
  perform t.as_user(a);
  perform t.throws('đóng phòng: không thêm bài được nữa', format($f$select public.room_add(%L, 'vidAFTER001', 'u', 't')$f$, rid), '%đã đóng%');
  perform t.throws('đóng phòng: chủ phòng cũng không điều khiển được nữa', format('select public.room_play(%L, 0, null)', rid), '%không có quyền%');

  -- ================= DỌN PHÒNG CŨ =================
  perform t.as_admin();
  insert into public.rooms (id, code, name, owner_id, created_at) values
    ('11111111-0000-0000-0000-000000000001', 'OLDAAA', 'Phòng 8 ngày không ai', a, now() - interval '8 days'),
    ('11111111-0000-0000-0000-000000000002', 'NEWBBB', 'Phòng mới có người', a, now() - interval '8 days'),
    ('11111111-0000-0000-0000-000000000003', 'DONECC', 'Đã đóng 31 ngày', a, now() - interval '40 days');
  update public.rooms set closed_at = now() - interval '31 days' where code = 'DONECC';
  insert into public.room_state (room_id, updated_at) select id, now() - interval '8 days' from public.rooms where code in ('OLDAAA', 'NEWBBB', 'DONECC');
  insert into public.room_members (room_id, user_id, role) select id, a, 'host' from public.rooms where code in ('OLDAAA', 'NEWBBB', 'DONECC');
  insert into public.room_activity (room_id, user_id, last_seen) select id, a, now() - interval '1 hour' from public.rooms where code = 'NEWBBB';
  res := public.close_stale_rooms();
  perform t.check('dọn phòng: đóng phòng quá 7 ngày không hoạt động', (select closed_at is not null from public.rooms where code = 'OLDAAA'), res::text);
  perform t.check('dọn phòng: giữ phòng còn người hoạt động gần đây', (select closed_at is null from public.rooms where code = 'NEWBBB'));
  perform t.check('dọn phòng: xoá hẳn phòng đã đóng quá 30 ngày (kéo theo dữ liệu con)', not exists (select 1 from public.rooms where code = 'DONECC') and not exists (select 1 from public.room_members where room_id = '11111111-0000-0000-0000-000000000003'));
  res := public.close_stale_rooms();
  perform t.check('dọn phòng: chạy lại không đóng/xoá thêm gì', (res ->> 'closed')::int = 0 and (res ->> 'deleted')::int = 0, res::text);

  -- ================= QUYỀN =================
  perform t.as_user(b);
  perform t.throws('quyền: client không gọi được close_stale_rooms', 'select public.close_stale_rooms()', '%permission denied%');
  perform t.throws('quyền: client không gọi được _room_settle', format('select public._room_settle(%L)', rid), '%permission denied%');
  perform t.throws('quyền: client không gọi được _room_shutdown', format('select public._room_shutdown(%L)', rid), '%permission denied%');
  perform t.as_anon();
  perform t.throws('quyền: người chưa đăng nhập không ping được', format('select public.room_ping(%L)', rid), '%permission denied%');
  perform t.throws('quyền: người chưa đăng nhập không thêm hàng loạt được', format($f$select public.room_add_many(%L, '[]'::jsonb)$f$, rid), '%permission denied%');
  perform t.as_admin();
end $$;
