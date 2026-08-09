import { supabase } from './supabase';
import type { MemberRole, Playlist, PlaylistWithRole } from '../types';

export async function getPlaylists(): Promise<PlaylistWithRole[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data: playlists, error } = await supabase
    .from('playlists')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  if (!playlists?.length) return [];

  const playlistIds = playlists.map((playlist) => playlist.id);
  const { data: memberships, error: memberError } = await supabase
    .from('playlist_members')
    .select('playlist_id, role')
    .eq('user_id', user.id)
    .in('playlist_id', playlistIds);

  if (memberError) throw memberError;

  const roleByPlaylist = new Map<string, MemberRole>(
    (memberships || []).map((membership) => [
      membership.playlist_id,
      membership.role as MemberRole,
    ]),
  );

  return (playlists as Playlist[]).map((playlist) => ({
    ...playlist,
    role: roleByPlaylist.get(playlist.id) || 'viewer',
  }));
}

export async function createPlaylist(name: string, description: string | null) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Bạn cần đăng nhập để tạo playlist.');

  const { data, error } = await supabase
    .from('playlists')
    .insert({ name, description, owner_id: user.id })
    .select('*')
    .single();

  if (error) throw error;
  return data as Playlist;
}

export async function updatePlaylist(
  playlistId: string,
  values: Pick<Playlist, 'name' | 'description'>,
) {
  const { error } = await supabase.from('playlists').update(values).eq('id', playlistId);
  if (error) throw error;
}

export async function deletePlaylist(playlistId: string) {
  const { error } = await supabase.from('playlists').delete().eq('id', playlistId);
  if (error) throw error;
}
