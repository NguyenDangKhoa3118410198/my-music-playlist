// Kiểm tra cấu hình Supabase. Hàm thuần (không dùng import.meta) để dùng được cả lúc build (vite.config.ts),
// lúc chạy trong trình duyệt và trong test.

const PLACEHOLDERS = ['your-project', 'your-anon-key', 'placeholder'];

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload + '='.repeat((4 - (payload.length % 4)) % 4))) as { role?: string };
    return json.role ?? null;
  } catch {
    return null;
  }
}

// Trả về danh sách vấn đề (rỗng nghĩa là hợp lệ). Mỗi mục nói rõ biến nào, sai ở đâu.
export function checkSupabaseEnv(rawUrl?: string, rawKey?: string): string[] {
  const url = (rawUrl ?? '').trim();
  const key = (rawKey ?? '').trim();
  const problems: string[] = [];

  if (!url) {
    problems.push('VITE_SUPABASE_URL đang trống hoặc chưa được khai báo.');
  } else if (PLACEHOLDERS.some((word) => url.includes(word))) {
    problems.push('VITE_SUPABASE_URL vẫn là giá trị mẫu, hãy điền URL project thật.');
  } else if (!/^https?:\/\//.test(url)) {
    problems.push('VITE_SUPABASE_URL phải bắt đầu bằng https:// (ví dụ https://xxxx.supabase.co).');
  } else if (/\/rest\/v1\/?$/.test(url)) {
    problems.push('VITE_SUPABASE_URL không được có đuôi /rest/v1, chỉ cần URL gốc (https://xxxx.supabase.co).');
  }

  if (!key) {
    problems.push('VITE_SUPABASE_ANON_KEY đang trống hoặc chưa được khai báo.');
  } else if (PLACEHOLDERS.some((word) => key.includes(word))) {
    problems.push('VITE_SUPABASE_ANON_KEY vẫn là giá trị mẫu, hãy điền khoá công khai thật (publishable/anon).');
  } else if (key.startsWith('sb_secret_') || decodeJwtRole(key) === 'service_role') {
    problems.push(
      'VITE_SUPABASE_ANON_KEY đang là KHOÁ BÍ MẬT (secret/service_role). Khoá này bỏ qua mọi quyền truy cập và sẽ lộ ra trình duyệt. ' +
        'Chỉ dùng publishable key (sb_publishable_...) hoặc anon key.',
    );
  }

  return problems;
}
