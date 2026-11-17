import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Mic2 } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { JoinPage } from './pages/JoinPage';
import { RoomPage } from './pages/RoomPage';
import { PlaylistView } from './components/PlaylistView';
import {
  clearInviteTokenFromUrl,
  readInviteTokenFromUrl,
  redeemInvite,
} from './lib/inviteApi';
import { getSupabaseSetupMessage, isSupabaseConfigured, supabase, supabaseConfigProblems } from './lib/supabase';

function RedirectToJoin() {
  const { code = '' } = useParams();
  return <Navigate to={`/join/${code}`} replace />;
}

function AppRoutes() {
  const [session, setSession] = useState<Session | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(() => readInviteTokenFromUrl());
  const [redeemedPlaylistId, setRedeemedPlaylistId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBooting(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !pendingInvite) return;

    let cancelled = false;

    async function redeem() {
      try {
        const playlistId = await redeemInvite(pendingInvite!);
        if (cancelled) return;
        setRedeemedPlaylistId(playlistId);
        setPendingInvite(null);
        clearInviteTokenFromUrl();
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Không nhận được link mời.');
        }
      }
    }

    void redeem();

    return () => {
      cancelled = true;
    };
  }, [pendingInvite, session]);

  if (!isSupabaseConfigured) {
    return (
      <main className="center-shell">
        <div className="room-ambient" aria-hidden="true" />
        <section className="center-card">
          <div className="center-icon is-warning">
            <AlertTriangle size={30} />
          </div>
          {import.meta.env.DEV ? (
            <>
              <h1>Cần cấu hình Supabase</h1>
              <p>{getSupabaseSetupMessage()}</p>
              <ul className="problem-list">
                {supabaseConfigProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <code className="code-block">cp .env.example .env</code>
            </>
          ) : (
            // Bản build thật đã được kiểm tra lúc build nên hiếm khi tới đây; nếu tới thì chỉ báo thân thiện, không lộ chi tiết kỹ thuật.
            <>
              <h1>Đang cập nhật ứng dụng</h1>
              <p>Ứng dụng tạm thời chưa sẵn sàng. Bạn vui lòng tải lại trang sau ít phút.</p>
              <button className="btn btn-primary btn-lg btn-block" type="button" onClick={() => window.location.reload()}>
                Tải lại trang
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  if (booting) {
    return (
      <main className="center-shell" aria-busy="true">
        <div className="room-ambient" aria-hidden="true" />
        <div className="center-icon">
          <Mic2 size={36} />
        </div>
        <span className="sr-only" role="status">
          Đang tải
        </span>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/join/:code" element={<JoinPage session={session} />} />
      <Route
        path="/room/:code"
        element={session ? <RoomPage userId={session.user.id} isAnonymous={Boolean(session.user.is_anonymous)} /> : <RedirectToJoin />}
      />
      <Route
        path="*"
        element={
          session ? (
            <>
              {message && <div className="global-error">{message}</div>}
              <PlaylistView inviteRedeemed={redeemedPlaylistId} />
            </>
          ) : (
            <AuthScreen pendingInvite={pendingInvite} />
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
