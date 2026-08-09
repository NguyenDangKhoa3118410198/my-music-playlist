import { supabase } from './supabase';
import type { MemberRole } from '../types';

export async function createInvite(playlistId: string, role: Exclude<MemberRole, 'owner'>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Bạn cần đăng nhập để tạo link mời.');

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  const { data, error } = await supabase
    .from('playlist_invites')
    .insert({
      playlist_id: playlistId,
      token,
      role,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('token')
    .single();

  if (error) throw error;
  return data.token as string;
}

export async function redeemInvite(token: string) {
  const { data, error } = await supabase.rpc('redeem_playlist_invite', {
    invite_token: token,
  });

  if (error) throw error;
  return data as string;
}

export function buildInviteUrl(token: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('invite', token);
  return url.toString();
}

export function readInviteTokenFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('invite');
}

export function clearInviteTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('invite');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}
