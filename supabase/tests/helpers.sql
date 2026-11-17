-- Bộ khung test nhỏ: đổi người dùng (role + auth.uid), ghi kết quả, kiểm tra lỗi.
create schema t;
create table t.results (name text, ok boolean, detail text);
grant usage on schema t to authenticated, anon;

create function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role anon';
end $$;

create function t.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- security definer: ghi được kết quả dù đang chạy dưới role authenticated
create function t.check(test_name text, cond boolean, detail text default null) returns void
language sql security definer as $$
  insert into t.results values (test_name, coalesce(cond, false), detail);
$$;

-- Chạy một câu lệnh và mong đợi nó báo lỗi (message khớp mẫu LIKE nếu có).
create function t.throws(test_name text, stmt text, expect_like text default null) returns void
language plpgsql as $$
declare msg text;
begin
  begin
    execute stmt;
    perform t.check(test_name, false, 'đáng lẽ phải báo lỗi nhưng không báo');
    return;
  exception when others then
    msg := sqlerrm;
  end;
  perform t.check(test_name, expect_like is null or msg like expect_like, 'lỗi nhận được: ' || msg);
end $$;

grant execute on all functions in schema t to authenticated, anon;
