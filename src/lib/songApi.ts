import { supabase } from './supabase';
import type { Song, SongInput } from '../types';

export async function getSongs(playlistId: string): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('playlist_id', playlistId)
    .order('favorite', { ascending: false })
    .order('title', { ascending: true });

  if (error) throw error;
  return (data || []) as Song[];
}

export async function createSong(playlistId: string, input: SongInput) {
  const { data, error } = await supabase
    .from('songs')
    .insert({
      playlist_id: playlistId,
      ...normalizeSongInput(input),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Song;
}

export async function updateSong(songId: string, input: SongInput) {
  const { data, error } = await supabase
    .from('songs')
    .update(normalizeSongInput(input))
    .eq('id', songId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Song;
}

export async function deleteSong(songId: string) {
  const { error } = await supabase.from('songs').delete().eq('id', songId);
  if (error) throw error;
}

export async function importSongs(playlistId: string, songs: SongInput[]) {
  if (!songs.length) return [];

  const payload = songs.map((song) => ({
    playlist_id: playlistId,
    ...normalizeSongInput(song),
  }));

  const { data, error } = await supabase.from('songs').insert(payload).select('*');
  if (error) throw error;
  return (data || []) as Song[];
}

function normalizeSongInput(input: SongInput) {
  return {
    title: input.title.trim(),
    artist: cleanOptional(input.artist),
    youtube_url: cleanOptional(input.youtube_url),
    key: cleanOptional(input.key),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    note: cleanOptional(input.note),
    favorite: input.favorite,
  };
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
