#!/usr/bin/env bash
# Chạy test SQL trên Postgres thật trong Docker (không cần Supabase). Dùng: npm run test:sql
# Áp schema.sql + rooms.sql (hai lần để kiểm tra chạy lại được), rồi chạy rooms.test.sql.
set -euo pipefail
cd "$(dirname "$0")"

NAME="pg-rooms-test-$$"
IMAGE="${PG_IMAGE:-postgres:16-alpine}"
cleanup() { docker stop "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x "$IMAGE" >/dev/null
for _ in $(seq 1 40); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql < stub.sql >/dev/null 2>&1
psql < ../schema.sql >/dev/null 2>&1
psql < ../rooms.sql >/dev/null 2>&1
echo "Áp dụng schema.sql + rooms.sql: OK"
psql < ../schema.sql >/dev/null 2>&1
psql < ../rooms.sql >/dev/null 2>&1
echo "Chạy lại lần 2 (idempotent): OK"

psql < helpers.sql >/dev/null
if ! psql < rooms.test.sql >/tmp/rooms-test.out 2>&1; then
  echo "Test bị lỗi khi chạy:"; grep -E "ERROR|DETAIL|CONTEXT|HINT" /tmp/rooms-test.out | head -12; exit 2
fi

psql -At -F ' | ' -c "select case when ok then 'PASS' else 'FAIL' end, name, coalesce(detail, '') from t.results order by (not ok) desc" \
  | awk -F ' [|] ' '{ if ($1=="FAIL") { printf "FAIL  %s  [%s]\n", $2, $3 } else { printf "PASS  %s\n", $2 } }'
FAILS=$(psql -At -c "select count(*) from t.results where not ok")
TOTAL=$(psql -At -c "select count(*) from t.results")
echo "---- $((TOTAL - FAILS))/$TOTAL đạt"
[ "$FAILS" = "0" ]
