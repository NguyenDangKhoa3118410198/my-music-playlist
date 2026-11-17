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

export type RoomControlMode = 'host_only' | 'everyone';
export type RoomRole = 'host' | 'dj' | 'listener';
export type RoomPlaybackStatus = 'idle' | 'playing' | 'paused';
export type RoomQueueStatus = 'queued' | 'playing' | 'played' | 'skipped';

export type Room = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  control_mode: RoomControlMode;
  max_queue_per_user: number;
  created_at: string;
  closed_at: string | null;
};

export type RoomMember = {
  room_id: string;
  user_id: string;
  role: RoomRole;
  joined_at: string;
  display_name: string;
};

export type RoomEndReason = 'ended' | 'skip' | 'unplayable' | 'removed';

export type RoomQueueItem = {
  id: string;
  room_id: string;
  video_id: string;
  youtube_url: string;
  title: string;
  thumbnail: string | null;
  added_by: string;
  position: number;
  status: RoomQueueStatus;
  created_at: string;
  /** Chỉ có với bài đã phát/bỏ qua (lịch sử). */
  finished_at?: string | null;
  end_reason?: RoomEndReason | null;
};

export type AddManyResult = {
  added: number;
  skipped_limit: number;
  skipped_duplicate: number;
  skipped_invalid: number;
};

export type RecentRoom = {
  id: string;
  code: string;
  name: string;
  status: RoomPlaybackStatus;
  updatedAt: string;
  memberCount: number;
};

export type RoomState = {
  room_id: string;
  current_queue_id: string | null;
  status: RoomPlaybackStatus;
  anchor_pos: number;
  anchor_at: string;
  version: number;
  updated_by: string | null;
  updated_at: string;
};
