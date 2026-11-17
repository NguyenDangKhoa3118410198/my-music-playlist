import { createClient } from '@supabase/supabase-js';
import { checkSupabaseEnv } from './supabaseEnv';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigProblems = checkSupabaseEnv(supabaseUrl, supabaseAnonKey);
export const isSupabaseConfigured = supabaseConfigProblems.length === 0;

export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);

// Lời nhắn cho lập trình viên (chỉ hiện khi chạy dev). Bản build thật luôn đã được kiểm tra lúc build.
export function getSupabaseSetupMessage() {
  return 'Cấu hình Supabase chưa đúng. Hãy tạo file .env từ .env.example và sửa các mục sau:';
}
