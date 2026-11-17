import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { checkSupabaseEnv } from './src/lib/supabaseEnv.ts';

export default defineConfig(({ command, mode }) => {
  // Build mà thiếu/sai biến Supabase thì dừng ngay. Nếu không, Vercel vẫn đưa bản hỏng lên chạy
  // (người dùng thấy màn hình lỗi cấu hình). Build thất bại thì Vercel giữ nguyên bản cũ đang chạy tốt.
  // Đặt SKIP_ENV_CHECK=1 nếu cố ý build mà không có backend (ví dụ CI chỉ để kiểm tra biên dịch).
  if (command === 'build' && loadEnv(mode, '.', '').SKIP_ENV_CHECK !== '1') {
    // Prefix rỗng: lấy cả biến hệ thống (Vercel đặt biến môi trường ở đây) lẫn file .env.
    const env = loadEnv(mode, '.', '');
    const problems = checkSupabaseEnv(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    if (problems.length) {
      throw new Error(
        [
          '',
          'Không thể build: cấu hình Supabase chưa đúng.',
          ...problems.map((problem) => `  - ${problem}`),
          '',
          'Trên Vercel: Settings -> Environment Variables -> thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY',
          'cho cả Production và Preview, rồi bấm Redeploy (biến VITE_* chỉ được nhúng lúc build).',
          'Chạy local: tạo file .env từ .env.example.',
          '',
        ].join('\n'),
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      open: true,
    },
  };
});
