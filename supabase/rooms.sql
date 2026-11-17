-- Room nghe chung. Chạy SAU schema.sql. Chạy được nhiều lần.
--
-- Tên hiển thị lấy từ bảng public.profiles(id, display_name) có sẵn từ schema.sql
-- (không tạo lại ở đây). Người dùng ẩn danh có display_name rỗng, client tự cập nhật.
--
-- Nguyên tắc: client chỉ ĐỌC các bảng room_*; mọi thay đổi đi qua RPC (security definer)
-- để kiểm tra vai trò. Vị trí phát lưu dạng "mốc neo" (anchor_pos, anchor_at):
--   playing: vị trí = anchor_pos + (now_server - anchor_at)
--   paused : vị trí = anchor_pos

-- ============ Bảng ============

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  control_mode text not null default 'host_only' check (control_mode in ('host_only', 'everyone')),
  max_queue_per_user int not null default 5 check (max_queue_per_user between 1 and 50),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'listener' check (role in ('host', 'dj', 'listener')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_queue (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  video_id text not null,
  youtube_url text not null,
  title text not null,
  thumbnail text,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position double precision not null,
  status text not null default 'queued' check (status in ('queued', 'playing', 'played', 'skipped')),
  created_at timestamptz not null default now()
);

create table if not exists public.room_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  current_queue_id uuid references public.room_queue (id) on delete set null,
  status text not null default 'idle' check (status in ('idle', 'playing', 'paused')),
  anchor_pos double precision not null default 0,
  anchor_at timestamptz not null default now(),
  version int not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Lịch sử: bài đã phát/bỏ qua vẫn nằm trong room_queue (status played/skipped), thêm thời điểm và lý do kết thúc.
alter table public.room_queue add column if not exists finished_at timestamptz;
alter table public.room_queue add column if not exists end_reason text
  check (end_reason in ('ended', 'skip', 'unplayable', 'removed'));

-- Nhịp tim: mỗi người trong phòng ping định kỳ để server biết còn ai đang nghe không.
-- Cố ý là bảng RIÊNG và KHÔNG đưa vào Realtime (nếu ghi vào room_members thì mỗi nhịp ping của mỗi người sẽ
-- bắn sự kiện tới mọi máy khác). Client không đọc được bảng này (không có policy), chỉ RPC ghi/đọc.
create table if not exists public.room_activity (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_queue_room_idx on public.room_queue (room_id, status, position);
create index if not exists room_queue_history_idx on public.room_queue (room_id, finished_at desc)
  where status in ('played', 'skipped');
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ============ Hàm hỗ trợ ============

create or replace function public.room_role(rid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.room_members where room_id = rid and user_id = auth.uid();
$$;

create or replace function public.is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = rid and user_id = auth.uid());
$$;

-- host/dj luôn điều khiển được; control_mode = 'everyone' thì mọi thành viên.
create or replace function public.can_control_room(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.room_id = rid and m.user_id = auth.uid() and r.closed_at is null
      and (m.role in ('host', 'dj') or r.control_mode = 'everyone')
  );
$$;

create or replace function public.gen_room_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- bỏ I, O, 0, 1 cho dễ đọc
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Bắt đầu phát một bài. Gọi trong giao dịch đã khoá room_state.
create or replace function public._room_start(rid uuid, qid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.room_queue set status = 'playing' where id = qid and room_id = rid;
  update public.room_state set
    current_queue_id = qid, status = 'playing', anchor_pos = 0, anchor_at = now(),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where room_id = rid;
end;
$$;

-- Chuyển sang bài tiếp theo hoặc về trạng thái chờ. Gọi trong giao dịch đã khoá room_state.
-- Bài vừa kết thúc được giữ lại làm lịch sử (tối đa 100 bài mỗi phòng).
drop function if exists public._room_advance(uuid, text);
create or replace function public._room_advance(rid uuid, finished_status text, finish_reason text default 'ended')
returns void language plpgsql security definer set search_path = public as $$
declare
  cur uuid;
  nxt uuid;
begin
  select current_queue_id into cur from public.room_state where room_id = rid;

  if cur is not null then
    update public.room_queue
    set status = finished_status, finished_at = now(), end_reason = finish_reason
    where id = cur;
  end if;

  delete from public.room_queue
  where room_id = rid and status in ('played', 'skipped')
    and id not in (
      select id from public.room_queue
      where room_id = rid and status in ('played', 'skipped')
      order by finished_at desc nulls last, created_at desc
      limit 100
    );

  select id into nxt from public.room_queue
  where room_id = rid and status = 'queued'
  order by position asc, created_at asc
  limit 1;

  if nxt is null then
    update public.room_state set
      current_queue_id = null, status = 'idle', anchor_pos = 0, anchor_at = now(),
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    where room_id = rid;
  else
    perform public._room_start(rid, nxt);
  end if;
end;
$$;

-- Nếu phòng đang "phát" mà đã lâu không ai nghe (không có ping/thao tác nào quá 120 giây) thì tạm dừng tại vị trí
-- mà người cuối cùng đã nghe tới. Nhờ đó khi có người vào lại sau vài giờ, bài đó không bị coi là "đã hết".
-- Dựa vào nhịp tim chứ không dựa vào lúc rời trang, nên cả khi đóng trình duyệt đột ngột hay mất mạng vẫn đúng.
create or replace function public._room_settle(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
  last_active timestamptz;
begin
  select * into st from public.room_state where room_id = rid for update;
  if not found or st.status <> 'playing' or st.current_queue_id is null then return; end if;

  select greatest(coalesce(max(last_seen), st.updated_at), st.updated_at) into last_active
  from public.room_activity where room_id = rid;
  if last_active is null then last_active := st.updated_at; end if;
  if now() - last_active <= interval '120 seconds' then return; end if;

  update public.room_state set
    status = 'paused',
    anchor_pos = st.anchor_pos + greatest(0, extract(epoch from (last_active - st.anchor_at))),
    anchor_at = now(),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where room_id = rid;
end;
$$;

-- Đóng phòng: dừng phát và đánh dấu closed_at. Dùng cho room_close, room_leave (người cuối) và dọn phòng cũ.
create or replace function public._room_shutdown(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.rooms set closed_at = coalesce(closed_at, now()) where id = rid;
  update public.room_state set
    status = 'idle', current_queue_id = null, anchor_pos = 0, anchor_at = now(),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where room_id = rid;
end;
$$;

-- ============ RLS (chỉ đọc) ============

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_queue enable row level security;
alter table public.room_state enable row level security;
alter table public.room_activity enable row level security; -- không có policy: chỉ hàm security definer truy cập được

drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated
  using (owner_id = auth.uid() or public.is_room_member(id));

drop policy if exists room_members_select on public.room_members;
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists room_queue_select on public.room_queue;
create policy room_queue_select on public.room_queue for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists room_state_select on public.room_state;
create policy room_state_select on public.room_state for select to authenticated
  using (public.is_room_member(room_id));

-- ============ RPC ============

create or replace function public.server_time()
returns timestamptz language sql stable as $$ select clock_timestamp(); $$;

create or replace function public.create_room(p_name text, p_control_mode text default 'host_only')
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  r public.rooms;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;

  insert into public.rooms (code, name, owner_id, control_mode)
  values (public.gen_room_code(), btrim(p_name), auth.uid(), p_control_mode)
  returning * into r;

  insert into public.room_members (room_id, user_id, role) values (r.id, auth.uid(), 'host');
  insert into public.room_state (room_id, updated_by) values (r.id, auth.uid());
  return r;
end;
$$;

create or replace function public.join_room(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;

  select id into rid from public.rooms where code = upper(btrim(p_code)) and closed_at is null;
  if rid is null then raise exception 'Không tìm thấy phòng hoặc phòng đã đóng.'; end if;

  perform public._room_settle(rid);

  insert into public.room_members (room_id, user_id, role)
  values (rid, auth.uid(), 'listener')
  on conflict (room_id, user_id) do nothing;

  insert into public.room_activity (room_id, user_id) values (rid, auth.uid())
  on conflict (room_id, user_id) do update set last_seen = now();
  return rid;
end;
$$;

create or replace function public.room_add(
  p_room uuid, p_video_id text, p_url text, p_title text, p_thumbnail text default null
)
returns public.room_queue language plpgsql security definer set search_path = public as $$
declare
  limit_n int;
  pending int;
  pos double precision;
  item public.room_queue;
  st public.room_state;
begin
  if not public.is_room_member(p_room) then raise exception 'Bạn không ở trong phòng này.'; end if;

  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{6,20}$' then raise exception 'Link video không hợp lệ.'; end if;

  select * into st from public.room_state where room_id = p_room for update;
  select max_queue_per_user into limit_n from public.rooms where id = p_room and closed_at is null;
  if limit_n is null then raise exception 'Phòng đã đóng.'; end if;

  select count(*) into pending from public.room_queue
  where room_id = p_room and added_by = auth.uid() and status = 'queued';
  if pending >= limit_n then
    raise exception 'Bạn đã có % bài đang chờ (giới hạn %).', pending, limit_n;
  end if;

  select coalesce(max(position), 0) + 1 into pos from public.room_queue where room_id = p_room;

  insert into public.room_queue (room_id, video_id, youtube_url, title, thumbnail, position)
  values (p_room, p_video_id, p_url, left(btrim(p_title), 200), p_thumbnail, pos)
  returning * into item;

  -- Hàng đợi đang trống thì phát luôn.
  if st.status = 'idle' then
    perform public._room_start(p_room, item.id);
    select * into item from public.room_queue where id = item.id;
  end if;

  return item;
end;
$$;

-- p_expected_version: nếu truyền vào và không khớp thì từ chối (client tự tải lại trạng thái).
create or replace function public.room_play(
  p_room uuid, p_pos double precision default null, p_expected_version int default null
)
returns public.room_state language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
  nxt uuid;
begin
  if not public.can_control_room(p_room) then raise exception 'Bạn không có quyền điều khiển phòng này.'; end if;

  select * into st from public.room_state where room_id = p_room for update;
  if p_expected_version is not null and p_expected_version <> st.version then
    raise exception 'version_conflict';
  end if;

  if st.current_queue_id is null then
    select id into nxt from public.room_queue
    where room_id = p_room and status = 'queued' order by position asc limit 1;
    if nxt is not null then perform public._room_start(p_room, nxt); end if;
  else
    update public.room_state set
      status = 'playing', anchor_pos = coalesce(p_pos, anchor_pos), anchor_at = now(),
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    where room_id = p_room;
  end if;

  select * into st from public.room_state where room_id = p_room;
  return st;
end;
$$;

create or replace function public.room_pause(
  p_room uuid, p_pos double precision, p_expected_version int default null
)
returns public.room_state language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
begin
  if not public.can_control_room(p_room) then raise exception 'Bạn không có quyền điều khiển phòng này.'; end if;

  select * into st from public.room_state where room_id = p_room for update;
  if p_expected_version is not null and p_expected_version <> st.version then
    raise exception 'version_conflict';
  end if;

  if st.current_queue_id is not null then
    update public.room_state set
      status = 'paused', anchor_pos = greatest(p_pos, 0), anchor_at = now(),
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    where room_id = p_room;
  end if;

  select * into st from public.room_state where room_id = p_room;
  return st;
end;
$$;

create or replace function public.room_seek(
  p_room uuid, p_pos double precision, p_expected_version int default null
)
returns public.room_state language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
begin
  if not public.can_control_room(p_room) then raise exception 'Bạn không có quyền điều khiển phòng này.'; end if;

  select * into st from public.room_state where room_id = p_room for update;
  if p_expected_version is not null and p_expected_version <> st.version then
    raise exception 'version_conflict';
  end if;

  if st.current_queue_id is not null then
    update public.room_state set
      anchor_pos = greatest(p_pos, 0), anchor_at = now(),
      version = version + 1, updated_by = auth.uid(), updated_at = now()
    where room_id = p_room;
  end if;

  select * into st from public.room_state where room_id = p_room;
  return st;
end;
$$;

-- Chuyển bài, idempotent: chỉ có tác dụng nếu p_expected vẫn là bài đang phát.
-- 'ended' / 'unplayable': mọi thành viên gọi được (mọi client đều báo khi video hết hoặc lỗi).
-- 'skip': cần quyền điều khiển.
create or replace function public.room_next(p_room uuid, p_expected uuid, p_reason text default 'ended')
returns public.room_state language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
begin
  if p_reason not in ('ended', 'unplayable', 'skip') then raise exception 'Lý do không hợp lệ.'; end if;

  if p_reason = 'skip' then
    if not public.can_control_room(p_room) then raise exception 'Bạn không có quyền điều khiển phòng này.'; end if;
  elsif not public.is_room_member(p_room) then
    raise exception 'Bạn không ở trong phòng này.';
  end if;

  select * into st from public.room_state where room_id = p_room for update;

  if st.current_queue_id is not distinct from p_expected then
    perform public._room_advance(
      p_room,
      case when p_reason = 'ended' then 'played' else 'skipped' end,
      p_reason
    );
  end if;

  select * into st from public.room_state where room_id = p_room;
  return st;
end;
$$;

create or replace function public.room_remove(p_room uuid, p_queue uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.room_queue;
  st public.room_state;
begin
  select * into st from public.room_state where room_id = p_room for update;
  select * into item from public.room_queue where id = p_queue and room_id = p_room;
  if not found then return; end if;

  if not (public.can_control_room(p_room) or item.added_by = auth.uid()) then
    raise exception 'Bạn không có quyền xoá bài này.';
  end if;

  if st.current_queue_id = item.id then
    perform public._room_advance(p_room, 'skipped', 'removed');
  end if;
  delete from public.room_queue where id = item.id;
end;
$$;

-- Client tính vị trí mới (trung điểm hai bài kề nhau) rồi gửi lên.
create or replace function public.room_reorder(p_room uuid, p_queue uuid, p_position double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_control_room(p_room) then raise exception 'Bạn không có quyền điều khiển phòng này.'; end if;
  update public.room_queue set position = p_position
  where id = p_queue and room_id = p_room and status = 'queued';
end;
$$;

create or replace function public.room_set_role(p_room uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.room_role(p_room) <> 'host' then raise exception 'Chỉ host mới đổi được vai trò.'; end if;
  if p_role not in ('dj', 'listener') then raise exception 'Vai trò không hợp lệ.'; end if;
  update public.room_members set role = p_role
  where room_id = p_room and user_id = p_user and role <> 'host';
end;
$$;

create or replace function public.room_close(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.room_role(p_room) is distinct from 'host' then raise exception 'Chỉ host mới đóng được phòng.'; end if;
  perform public._room_shutdown(p_room);
end;
$$;

-- Rời phòng. Host rời mà còn người khác thì chuyển quyền host cho DJ (hoặc người vào sớm nhất); không còn ai thì đóng phòng.
create or replace function public.room_leave(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  my_role text := public.room_role(p_room);
  successor uuid;
begin
  if my_role is null then return; end if;

  if my_role = 'host' then
    select user_id into successor from public.room_members
    where room_id = p_room and user_id <> auth.uid()
    order by (role = 'dj') desc, joined_at asc
    limit 1;

    if successor is null then
      perform public._room_shutdown(p_room);
    else
      update public.room_members set role = 'host' where room_id = p_room and user_id = successor;
      update public.rooms set owner_id = successor where id = p_room;
    end if;
  end if;

  delete from public.room_members where room_id = p_room and user_id = auth.uid();
  delete from public.room_activity where room_id = p_room and user_id = auth.uid();
end;
$$;

-- Nhịp tim: client gọi khi vào phòng và mỗi ~45 giây.
create or replace function public.room_ping(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_member(p_room) then return; end if;
  insert into public.room_activity (room_id, user_id) values (p_room, auth.uid())
  on conflict (room_id, user_id) do update set last_seen = now();
end;
$$;

-- Client gọi NGAY KHI vào phòng và TRƯỚC khi ping, để dọn trạng thái "đang phát" cũ nếu không ai nghe.
create or replace function public.room_settle(p_room uuid)
returns public.room_state language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
begin
  if not public.is_room_member(p_room) then raise exception 'Bạn không ở trong phòng này.'; end if;
  perform public._room_settle(p_room);
  select * into st from public.room_state where room_id = p_room;
  return st;
end;
$$;

-- Thêm nhiều bài một lần (từ playlist). Chủ phòng/DJ không bị giới hạn số bài chờ; người nghe vẫn bị giới hạn.
-- Bỏ qua bài trùng (đang chờ/đang phát), bài sai định dạng; trả về số liệu để giao diện báo lại.
create or replace function public.room_add_many(p_room uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st public.room_state;
  limit_n int;
  pending int;
  my_role text;
  item jsonb;
  vid text;
  pos double precision;
  new_id uuid;
  first_new uuid;
  added int := 0;
  skipped_limit int := 0;
  skipped_duplicate int := 0;
  skipped_invalid int := 0;
begin
  if not public.is_room_member(p_room) then raise exception 'Bạn không ở trong phòng này.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Danh sách bài không hợp lệ.'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Mỗi lần chỉ thêm tối đa 100 bài.'; end if;

  select * into st from public.room_state where room_id = p_room for update;
  select max_queue_per_user into limit_n from public.rooms where id = p_room and closed_at is null;
  if limit_n is null then raise exception 'Phòng đã đóng.'; end if;

  my_role := public.room_role(p_room);
  select count(*) into pending from public.room_queue
  where room_id = p_room and added_by = auth.uid() and status = 'queued';
  select coalesce(max(position), 0) into pos from public.room_queue where room_id = p_room;

  for item in select value from jsonb_array_elements(p_items) loop
    vid := item ->> 'video_id';
    if vid is null or vid !~ '^[A-Za-z0-9_-]{6,20}$' or coalesce(btrim(item ->> 'title'), '') = '' then
      skipped_invalid := skipped_invalid + 1;
      continue;
    end if;
    if exists (
      select 1 from public.room_queue
      where room_id = p_room and video_id = vid and status in ('queued', 'playing')
    ) then
      skipped_duplicate := skipped_duplicate + 1;
      continue;
    end if;
    if my_role not in ('host', 'dj') and pending >= limit_n then
      skipped_limit := skipped_limit + 1;
      continue;
    end if;

    pos := pos + 1;
    insert into public.room_queue (room_id, video_id, youtube_url, title, thumbnail, position)
    values (p_room, vid, 'https://youtu.be/' || vid, left(btrim(item ->> 'title'), 200), nullif(item ->> 'thumbnail', ''), pos)
    returning id into new_id;

    if first_new is null then first_new := new_id; end if;
    added := added + 1;
    pending := pending + 1;
  end loop;

  if added > 0 and st.status = 'idle' then
    perform public._room_start(p_room, first_new);
  end if;

  return jsonb_build_object(
    'added', added,
    'skipped_limit', skipped_limit,
    'skipped_duplicate', skipped_duplicate,
    'skipped_invalid', skipped_invalid
  );
end;
$$;

-- Dọn phòng không hoạt động: đóng phòng quá p_days ngày không ai thao tác/nghe, và xoá hẳn phòng đã đóng quá
-- p_purge_days ngày (kéo theo hàng đợi, lịch sử, thành viên). Được pg_cron gọi mỗi ngày (xem cuối file).
create or replace function public.close_stale_rooms(p_days int default 7, p_purge_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  closed_n int;
  deleted_n int;
begin
  with stale as (
    select r.id
    from public.rooms r
    left join public.room_state s on s.room_id = r.id
    where r.closed_at is null
      and greatest(
        r.created_at,
        coalesce(s.updated_at, r.created_at),
        coalesce((select max(a.last_seen) from public.room_activity a where a.room_id = r.id), r.created_at)
      ) < now() - make_interval(days => p_days)
  )
  update public.rooms set closed_at = now() where id in (select id from stale);
  get diagnostics closed_n = row_count;

  delete from public.rooms where closed_at is not null and closed_at < now() - make_interval(days => p_purge_days);
  get diagnostics deleted_n = row_count;

  return jsonb_build_object('closed', closed_n, 'deleted', deleted_n);
end;
$$;

-- ============ Quyền thực thi ============

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'server_time()',
    'create_room(text, text)',
    'join_room(text)',
    'room_add(uuid, text, text, text, text)',
    'room_play(uuid, double precision, int)',
    'room_pause(uuid, double precision, int)',
    'room_seek(uuid, double precision, int)',
    'room_next(uuid, uuid, text)',
    'room_remove(uuid, uuid)',
    'room_reorder(uuid, uuid, double precision)',
    'room_set_role(uuid, uuid, text)',
    'room_close(uuid)',
    'room_leave(uuid)',
    'room_ping(uuid)',
    'room_settle(uuid)',
    'room_add_many(uuid, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- Hàm nội bộ: client không được gọi trực tiếp.
revoke all on function public._room_start(uuid, uuid) from public, anon, authenticated;
revoke all on function public._room_advance(uuid, text, text) from public, anon, authenticated;
revoke all on function public._room_settle(uuid) from public, anon, authenticated;
revoke all on function public._room_shutdown(uuid) from public, anon, authenticated;
revoke all on function public.close_stale_rooms(int, int) from public, anon, authenticated;

-- ============ Realtime ============

do $$
declare
  t text;
begin
  foreach t in array array['room_state', 'room_queue', 'room_members', 'rooms'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============ Tự dọn phòng cũ (pg_cron) ============
-- Cần bật extension pg_cron (Supabase: Database -> Extensions -> pg_cron). Nếu chưa bật, file vẫn chạy bình thường
-- (chỉ báo NOTICE); bật rồi chạy lại file này để đặt lịch.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'close-stale-rooms') then
      perform cron.unschedule('close-stale-rooms');
    end if;
    perform cron.schedule('close-stale-rooms', '0 3 * * *', 'select public.close_stale_rooms()');
  else
    raise notice 'pg_cron chưa bật nên chưa đặt lịch tự dọn phòng cũ.';
  end if;
exception when others then
  raise notice 'Không đặt được lịch pg_cron: %', sqlerrm;
end $$;
