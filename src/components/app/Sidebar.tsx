import { Compass, Heart, Library, Mic2, Plus, Radio } from 'lucide-react';
import type { PlaylistWithRole, Song } from '../../types';
import { RoomLauncher } from '../room/RoomLauncher';
import { Cover } from '../ui/Cover';

export type AppView = 'home' | 'library' | 'favorites' | 'playlist';

type Props = {
  view: AppView;
  playlists: PlaylistWithRole[];
  songs: Song[];
  activePlaylistId: string | null;
  loading?: boolean;
  onNavigate: (path: string) => void;
  onCreatePlaylist: () => void;
};

export function Sidebar({ view, playlists, songs, activePlaylistId, loading, onNavigate, onCreatePlaylist }: Props) {
  const item = (target: AppView, path: string, icon: React.ReactNode, label: string) => (
    <button
      className={view === target ? 'nav-item is-active' : 'nav-item'}
      type="button"
      aria-current={view === target ? 'page' : undefined}
      onClick={() => onNavigate(path)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <aside className="sidebar" aria-label="Điều hướng chính">
      <div className="brand">
        <span className="brand-logo">
          <Mic2 size={20} />
        </span>
        <div>
          <strong>Karaoke</strong>
          <span>Nghe cùng nhau</span>
        </div>
      </div>

      <nav className="nav">
        {item('home', '/', <Compass size={19} />, 'Khám phá')}
        {item('library', '/library', <Library size={19} />, 'Thư viện')}
        {item('favorites', '/favorites', <Heart size={19} />, 'Yêu thích')}
        <RoomLauncher
          renderTrigger={(open) => (
            <button className="nav-item" type="button" onClick={() => open()}>
              <Radio size={19} />
              Phòng nghe chung
            </button>
          )}
        />
      </nav>

      <section>
        <div className="side-title">
          <span>Playlist của bạn</span>
          <button className="icon-btn icon-btn-sm is-quiet" type="button" aria-label="Tạo playlist" onClick={onCreatePlaylist}>
            <Plus size={16} />
          </button>
        </div>
        <div className="side-playlists" style={{ marginTop: 8 }} aria-busy={loading || undefined}>
          {loading &&
            [0, 1, 2].map((index) => (
              <div key={index} className="side-playlist is-skeleton" aria-hidden="true">
                <span className="sk sk-thumb is-sm" />
                <span className="sk-lines">
                  <span className="sk sk-line-md" />
                  <span className="sk sk-line-sm" />
                </span>
              </div>
            ))}
          {playlists.map((playlist) => {
            const own = songs.filter((song) => song.playlist_id === playlist.id);
            return (
              <button
                key={playlist.id}
                className={playlist.id === activePlaylistId ? 'side-playlist is-active' : 'side-playlist'}
                type="button"
                onClick={() => onNavigate(`/playlist/${playlist.id}`)}
              >
                <Cover seed={playlist.id} name={playlist.name} songs={own} className="is-sm" />
                <span>
                  <strong>{playlist.name}</strong>
                  <small>{own.length} bài hát</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
