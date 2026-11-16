import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Radio } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthScreen } from '../components/AuthScreen';
import { Spinner } from '../components/ui/Spinner';
import { errorMessage, joinRoom } from '../lib/roomApi';
import { supabase } from '../lib/supabase';

export function JoinPage({ session }: { session: Session | null }) {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [useAccount, setUseAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Đã có phiên đăng nhập (tài khoản hoặc ẩn danh) thì vào phòng ngay.
  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;
    joinRoom(code)
      .then(() => {
        if (!cancelled) navigate(`/room/${code.toUpperCase()}`, { replace: true });
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });

    return () => {
      cancelled = true;
    };
  }, [session, code, navigate]);

  async function handleGuest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: name.trim() } },
    });
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('anonymous')
          ? 'Chưa bật đăng nhập ẩn danh trên Supabase (Authentication → Sign In / Providers).'
          : signInError.message,
      );
      setBusy(false);
    }
  }

  if (!session && useAccount) return <AuthScreen pendingInvite={null} />;

  return (
    <main className="center-shell">
      <div className="room-ambient" aria-hidden="true" />
      <section className="center-card">
        <div className="center-icon">
          <Radio size={36} />
        </div>
        <h1>Nghe nhạc cùng nhau</h1>
        <span className="code-chip" aria-label={`Mã phòng ${code.toUpperCase()}`}>
          {code.toUpperCase()}
        </span>

        {session ? (
          error ? (
            <>
              <p className="form-message">{error}</p>
              <Link className="btn" to="/">
                Về trang chủ
              </Link>
            </>
          ) : (
            <Spinner size={30} label="Đang vào phòng" />
          )
        ) : (
          <>
            <p>Nhập tên để nghe cùng mọi người, không cần tạo tài khoản.</p>
            <form onSubmit={handleGuest}>
              <label>
                Tên hiển thị
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Ví dụ: Lan" autoComplete="nickname" />
              </label>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || !name.trim()}>
                {busy && <Spinner size={18} />}
                Vào phòng
              </button>
            </form>
            {error && <p className="form-message">{error}</p>}
            <button className="btn btn-block" type="button" onClick={() => setUseAccount(true)}>
              Đăng nhập bằng tài khoản
            </button>
          </>
        )}
      </section>
    </main>
  );
}
