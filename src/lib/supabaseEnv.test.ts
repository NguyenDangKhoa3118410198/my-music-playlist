// Chạy: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSupabaseEnv } from './supabaseEnv.ts';

const URL_OK = 'https://abcdwxyz.supabase.co';
const KEY_OK = 'sb_publishable_AbC123_xyz';

const jwt = (payload: object) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
};

test('cấu hình hợp lệ: không có vấn đề', () => {
  assert.deepEqual(checkSupabaseEnv(URL_OK, KEY_OK), []);
});

test('anon key dạng JWT (role anon) hợp lệ', () => {
  assert.deepEqual(checkSupabaseEnv(URL_OK, jwt({ role: 'anon', iss: 'supabase' })), []);
});

test('khoảng trắng thừa ở hai đầu được bỏ qua (hay gặp khi dán vào Vercel)', () => {
  assert.deepEqual(checkSupabaseEnv(`  ${URL_OK}\n`, `${KEY_OK} `), []);
});

test('thiếu cả hai biến: báo đúng tên từng biến', () => {
  const problems = checkSupabaseEnv(undefined, undefined);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /VITE_SUPABASE_URL/);
  assert.match(problems[1], /VITE_SUPABASE_ANON_KEY/);
});

test('chuỗi rỗng coi như thiếu', () => {
  assert.equal(checkSupabaseEnv('', '').length, 2);
});

test('giá trị mẫu bị từ chối', () => {
  assert.match(checkSupabaseEnv('https://your-project.supabase.co', KEY_OK)[0], /giá trị mẫu/);
  assert.match(checkSupabaseEnv(URL_OK, 'your-anon-key')[0], /giá trị mẫu/);
});

test('URL có đuôi /rest/v1 bị từ chối (lỗi cũ trong .env.example)', () => {
  assert.match(checkSupabaseEnv(`${URL_OK}/rest/v1/`, KEY_OK)[0], /rest\/v1/);
  assert.match(checkSupabaseEnv(`${URL_OK}/rest/v1`, KEY_OK)[0], /rest\/v1/);
});

test('URL không có https:// bị từ chối', () => {
  assert.match(checkSupabaseEnv('abcdwxyz.supabase.co', KEY_OK)[0], /https/);
});

test('khoá bí mật không bao giờ được dùng ở trình duyệt', () => {
  assert.match(checkSupabaseEnv(URL_OK, 'sb_secret_abc123')[0], /KHOÁ BÍ MẬT/);
  assert.match(checkSupabaseEnv(URL_OK, jwt({ role: 'service_role' }))[0], /KHOÁ BÍ MẬT/);
});

test('JWT hỏng không làm hàm văng lỗi', () => {
  assert.deepEqual(checkSupabaseEnv(URL_OK, 'a.b.c'), []);
});
