import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { PlaylistView } from './components/PlaylistView';
import {
  clearInviteTokenFromUrl,
  readInviteTokenFromUrl,
  redeemInvite,
} from './lib/inviteApi';
import { getSupabaseSetupMessage, isSupabaseConfigured, supabase } from './lib/supabase';

export default function App() {
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
      <main className="auth-shell">
        <section className="auth-panel setup-panel">
          <div className="brand-mark warning">
            <AlertTriangle size={30} />
          </div>
          <h1>Cần cấu hình Supabase</h1>
          <p className="muted">{getSupabaseSetupMessage()}</p>
          <code className="code-block">cp .env.example .env</code>
        </section>
      </main>
    );
  }

  if (booting) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1>Đang mở playlist...</h1>
          <p className="muted">Đang kiểm tra phiên đăng nhập.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen pendingInvite={pendingInvite} />;
  }

  return (
    <>
      {message && <div className="global-error">{message}</div>}
      <PlaylistView inviteRedeemed={redeemedPlaylistId} />
    </>
  );
}
