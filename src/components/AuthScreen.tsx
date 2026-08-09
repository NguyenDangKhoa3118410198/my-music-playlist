import { useState } from 'react';
import { LogIn, Music2, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AuthScreen({ pendingInvite }: { pendingInvite: string | null }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const authCall =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName || email.split('@')[0] } },
          });

    const { error } = await authCall;
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      mode === 'register'
        ? 'Đã tạo tài khoản. Nếu Supabase bật xác nhận email, hãy kiểm tra hộp thư trước khi đăng nhập.'
        : 'Đăng nhập thành công.',
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Music2 size={30} />
        </div>
        <h1>Karaoke Playlist</h1>
        <p className="muted">
          Lưu bài tủ, gắn link YouTube và chia sẻ playlist cho buổi hát.
        </p>

        {pendingInvite && (
          <div className="notice">
            Bạn đang mở link mời. Đăng nhập hoặc đăng ký để nhận quyền vào playlist.
          </div>
        )}

        <div className="segmented">
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => setMode('login')}
          >
            Đăng nhập
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            type="button"
            onClick={() => setMode('register')}
          >
            Đăng ký
          </button>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Tên hiển thị
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Khoa"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          <button className="primary-button" disabled={loading} type="submit">
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>

        {message && <p className="form-message">{message}</p>}
      </section>
    </main>
  );
}
