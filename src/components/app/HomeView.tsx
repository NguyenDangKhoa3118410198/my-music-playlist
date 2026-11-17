import { ListMusic, Play, Plus, Radio } from 'lucide-react';
import { getYoutubeThumbnailUrl } from '../../lib/youtube';
import type { PlaylistWithRole, RecentRoom, Song } from '../../types';
import { RoomLauncher } from '../room/RoomLauncher';
import { PlaylistCardSkeletons } from '../ui/Skeletons';
import { PlaylistCard } from './PlaylistCard';

type Props = {
  playlists: PlaylistWithRole[];
  songs: Song[];
  loading: boolean;
  onOpenPlaylist: (id: string) => void;
  onNavigate: (path: string) => void;
  onCreatePlaylist: () => void;
  onPlay: (song: Song, list: Song[]) => void;
  rooms: RecentRoom[];
  onOpenRoom: (code: string) => void;
};

function SongTile({ song, list, onPlay }: { song: Song; list: Song[]; onPlay: Props['onPlay'] }) {
  const thumb = getYoutubeThumbnailUrl(song.youtube_url);
  return (
    <button className="song-tile" type="button" onClick={() => onPlay(song, list)} aria-label={`Phát ${song.title}`}>
      <span className="tile-art">
        {thumb && <img src={thumb} alt="" loading="lazy" />}
        <span className="tile-play">
          <Play size={20} fill="currentColor" />
        </span>
      </span>
      <span>
        <strong>{song.title}</strong>
        <small>{song.artist || 'Chưa có ca sĩ'}</small>
      </span>
    </button>
  );
}

export function NewPlaylistCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button className="pl-card pl-card-new" type="button" onClick={onCreate}>
      <span className="empty-icon">
        <Plus size={26} />
      </span>
      <strong>Tạo playlist</strong>
    </button>
  );
}

const ROOM_STATUS: Record<RecentRoom['status'], string> = { playing: 'Đang phát', paused: 'Tạm dừng', idle: 'Đang chờ bài' };

export function HomeView({ playlists, songs, loading, onOpenPlaylist, onNavigate, onCreatePlaylist, onPlay, rooms, onOpenRoom }: Props) {
  const playable = songs.filter((song) => song.youtube_url);
  const recent = playable.slice(0, 12);
  const favorites = playable.filter((song) => song.favorite);

  return (
    <>
      <section className="hero section">
        <h1>Nghe nhạc cùng nhau, mỗi người một link YouTube</h1>
        <p>Tạo phòng, gửi mã cho bạn bè. Ai cũng thêm bài được, cả phòng nghe cùng một lúc.</p>
        <div className="hero-actions">
          <RoomLauncher
            renderTrigger={(open) => (
              <button className="btn btn-primary btn-lg" type="button" onClick={() => open('create')}>
                <Radio size={20} /> Tạo phòng nghe chung
              </button>
            )}
          />
          <RoomLauncher
            renderTrigger={(open) => (
              <button className="btn btn-lg" type="button" onClick={() => open('join')}>
                Vào bằng mã
              </button>
            )}
          />
        </div>
        <Radio className="hero-art" size={220} strokeWidth={1.2} aria-hidden="true" />
      </section>

      {rooms.length > 0 && (
        <section className="section" aria-labelledby="home-rooms">
          <div className="section-head">
            <div>
              <h2 id="home-rooms">Phòng gần đây</h2>
              <p>Vào lại các phòng nghe chung bạn đang tham gia.</p>
            </div>
          </div>
          <div className="room-card-list">
            {rooms.map((room) => (
              <button key={room.id} className="room-card" type="button" onClick={() => onOpenRoom(room.code)} aria-label={`Vào lại phòng ${room.name}`}>
                <span className={room.status === 'playing' ? 'room-card-icon is-live' : 'room-card-icon'}>
                  <Radio size={20} />
                </span>
                <span className="room-card-text">
                  <strong>{room.name}</strong>
                  <small>
                    {ROOM_STATUS[room.status]} · {room.memberCount} người
                  </small>
                </span>
                <span className="room-card-code" aria-label={`Mã ${room.code}`}>
                  {room.code}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="home-playlists">
        <div className="section-head">
          <div>
            <h2 id="home-playlists">Playlist của bạn</h2>
            <p>Lưu bài hát yêu thích và chia sẻ cho bạn bè.</p>
          </div>
          {playlists.length > 5 && (
            <button className="btn btn-quiet btn-sm" type="button" onClick={() => onNavigate('/library')}>
              Xem tất cả
            </button>
          )}
        </div>

        {loading ? (
          <div className="card-grid" aria-busy="true" aria-label="Đang tải playlist">
            <PlaylistCardSkeletons count={4} />
          </div>
        ) : playlists.length ? (
          <div className="card-grid">
            {playlists.slice(0, 5).map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                songs={songs.filter((song) => song.playlist_id === playlist.id)}
                onOpen={onOpenPlaylist}
              />
            ))}
            <NewPlaylistCard onCreate={onCreatePlaylist} />
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <ListMusic size={30} />
            </span>
            <h3>Chưa có playlist nào</h3>
            <p>Tạo playlist đầu tiên hoặc mở link mời từ bạn bè.</p>
            <button className="btn btn-primary" type="button" onClick={onCreatePlaylist} style={{ marginTop: 8 }}>
              <Plus size={18} /> Tạo playlist
            </button>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="section" aria-labelledby="home-recent">
          <div className="section-head">
            <h2 id="home-recent">Mới thêm</h2>
          </div>
          <div className="tile-row">
            {recent.map((song) => (
              <SongTile key={song.id} song={song} list={recent} onPlay={onPlay} />
            ))}
          </div>
        </section>
      )}

      {favorites.length > 0 && (
        <section className="section" aria-labelledby="home-favorites">
          <div className="section-head">
            <h2 id="home-favorites">Bài yêu thích</h2>
            <button className="btn btn-quiet btn-sm" type="button" onClick={() => onNavigate('/favorites')}>
              Xem tất cả
            </button>
          </div>
          <div className="tile-row">
            {favorites.slice(0, 12).map((song) => (
              <SongTile key={song.id} song={song} list={favorites} onPlay={onPlay} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
