import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseAnonKey.includes('your-anon-key'),
);

export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);

export function getSupabaseSetupMessage() {
  return 'Thiếu cấu hình Supabase. Hãy tạo file .env từ .env.example rồi điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.';
}
