export type MemberRole = 'owner' | 'editor' | 'viewer';

export type Playlist = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistWithRole = Playlist & {
  role: MemberRole;
};

export type Song = {
  id: string;
  playlist_id: string;
  title: string;
  artist: string | null;
  youtube_url: string | null;
  key: string | null;
  tags: string[];
  note: string | null;
  favorite: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SongInput = {
  title: string;
  artist?: string;
  youtube_url?: string;
  key?: string;
  tags: string[];
  note?: string;
  favorite: boolean;
};

export type FilterMode = 'all' | 'favorite' | 'with-youtube' | 'missing-youtube';
