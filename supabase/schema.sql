-- Schema cơ bản: playlist, thành viên, link mời, bài hát, hồ sơ người dùng.
--
-- CHỈ DÙNG CHO PROJECT SUPABASE MỚI. Project "Playlist" cũ đã có sẵn tất cả những thứ này
-- (file này được dựng lại từ định nghĩa thật của nó) - ở project cũ chỉ chạy rooms.sql.
-- Cột của profiles và songs, thứ tự cột là suy ra từ code và hàm handle_new_user.

create extension if not exists pgcrypto;

do $$ begin
  create type public.playlist_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null;
end $$;

-- ============ Bảng ============

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_members (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.playlist_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  title text not null,
  artist text,
  youtube_url text,
  key text,
  tags text[] not null default '{}',
  note text,
  favorite boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_invites (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  token text not null unique,
  role public.playlist_role not null,
  expires_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists songs_playlist_idx on public.songs (playlist_id);
create index if not exists playlist_members_user_idx on public.playlist_members (user_id);

-- ============ Hàm ============

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_playlist_role(target_playlist_id uuid)
returns public.playlist_role language sql stable security definer set search_path to 'public' as $$
  select pm.role
  from public.playlist_members pm
  where pm.playlist_id = target_playlist_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_playlist(target_playlist_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.playlist_members pm
    where pm.playlist_id = target_playlist_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_playlist(target_playlist_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.current_playlist_role(target_playlist_id) in ('owner', 'editor'), false);
$$;

-- Người tạo playlist tự thành 'owner'.
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.playlist_members (playlist_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (playlist_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

-- Tạo hồ sơ khi có người dùng mới (kể cả đăng nhập ẩn danh: email và tên rỗng).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.redeem_playlist_invite(invite_token text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  invite_row public.playlist_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để nhận link mời.';
  end if;

  select *
  into invite_row
  from public.playlist_invites
  where token = invite_token
    and expires_at > now()
  limit 1;

  if invite_row.id is null then
    raise exception 'Link mời không hợp lệ hoặc đã hết hạn.';
  end if;

  -- Chỉ nâng quyền, không bao giờ hạ quyền người đã là owner/editor.
  insert into public.playlist_members (playlist_id, user_id, role)
  values (invite_row.playlist_id, auth.uid(), invite_row.role)
  on conflict (playlist_id, user_id) do update
    set role = case
      when public.playlist_members.role = 'owner' then 'owner'
      when public.playlist_members.role = 'editor' then 'editor'
      else excluded.role
    end;

  update public.playlist_invites
  set used_at = now()
  where id = invite_row.id;

  return invite_row.playlist_id;
end;
$$;

revoke all on function public.redeem_playlist_invite(text) from public, anon;
grant execute on function public.redeem_playlist_invite(text) to authenticated;

-- ============ Trigger ============

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at before update on public.songs
  for each row execute function public.set_updated_at();

drop trigger if exists playlists_add_owner_membership on public.playlists;
create trigger playlists_add_owner_membership after insert on public.playlists
  for each row execute function public.add_owner_membership();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS ============

alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_members enable row level security;
alter table public.songs enable row level security;
alter table public.playlist_invites enable row level security;

drop policy if exists "Profiles are visible to authenticated users" on public.profiles;
create policy "Profiles are visible to authenticated users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members can view playlists" on public.playlists;
create policy "Members can view playlists" on public.playlists
  for select to authenticated using (owner_id = auth.uid() or public.can_view_playlist(id));

drop policy if exists "Users can create owned playlists" on public.playlists;
create policy "Users can create owned playlists" on public.playlists
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "Owners can update playlists" on public.playlists;
create policy "Owners can update playlists" on public.playlists
  for update to authenticated
  using (public.current_playlist_role(id) = 'owner')
  with check (public.current_playlist_role(id) = 'owner');

drop policy if exists "Owners can delete playlists" on public.playlists;
create policy "Owners can delete playlists" on public.playlists
  for delete to authenticated using (public.current_playlist_role(id) = 'owner');

drop policy if exists "Users can view their memberships" on public.playlist_members;
create policy "Users can view their memberships" on public.playlist_members
  for select to authenticated
  using (user_id = auth.uid() or public.current_playlist_role(playlist_id) = 'owner');

drop policy if exists "Owners can manage members" on public.playlist_members;
create policy "Owners can manage members" on public.playlist_members
  for all to authenticated
  using (public.current_playlist_role(playlist_id) = 'owner')
  with check (public.current_playlist_role(playlist_id) = 'owner');

drop policy if exists "Members can view songs" on public.songs;
create policy "Members can view songs" on public.songs
  for select to authenticated using (public.can_view_playlist(playlist_id));

drop policy if exists "Editors can create songs" on public.songs;
create policy "Editors can create songs" on public.songs
  for insert to authenticated with check (public.can_edit_playlist(playlist_id));

drop policy if exists "Editors can update songs" on public.songs;
create policy "Editors can update songs" on public.songs
  for update to authenticated
  using (public.can_edit_playlist(playlist_id))
  with check (public.can_edit_playlist(playlist_id));

drop policy if exists "Editors can delete songs" on public.songs;
create policy "Editors can delete songs" on public.songs
  for delete to authenticated using (public.can_edit_playlist(playlist_id));

drop policy if exists "Owners can view invites" on public.playlist_invites;
create policy "Owners can view invites" on public.playlist_invites
  for select to authenticated using (public.current_playlist_role(playlist_id) = 'owner');

drop policy if exists "Owners can create invites" on public.playlist_invites;
create policy "Owners can create invites" on public.playlist_invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_playlist_role(playlist_id) = 'owner'
    and role in ('editor', 'viewer')
  );

drop policy if exists "Owners can delete invites" on public.playlist_invites;
create policy "Owners can delete invites" on public.playlist_invites
  for delete to authenticated using (public.current_playlist_role(playlist_id) = 'owner');
