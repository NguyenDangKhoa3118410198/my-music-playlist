import { Download, MoreHorizontal, Music2, Play, Plus, Share2, Shuffle, Trash2, Upload } from 'lucide-react';
import type { FilterMode, MemberRole, PlaylistWithRole, Song } from '../../types';
import { Cover } from '../ui/Cover';
import { Menu } from '../ui/Menu';
import { SongRowSkeletons } from '../ui/Skeletons';
import { SongRow } from './SongRow';

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Chủ playlist', editor: 'Được sửa', viewer: 'Chỉ xem' };

const FILTERS: { mode: FilterMode; label: string; count: (songs: Song[]) => number }[] = [
  { mode: 'all', label: 'Tất cả', count: (songs) => songs.length },
  { mode: 'favorite', label: 'Yêu thích', count: (songs) => songs.filter((s) => s.favorite).length },
  { mode: 'with-youtube', label: 'Có thể phát', count: (songs) => songs.filter((s) => s.youtube_url).length },
  { mode: 'missing-youtube', label: 'Thiếu link', count: (songs) => songs.filter((s) => !s.youtube_url).length },
];

type Props = {
  playlist: PlaylistWithRole;
  songs: Song[];
  visibleSongs: Song[];
  filter: FilterMode;
  onFilter: (mode: FilterMode) => void;
  tags: [string, number][];
  activeTag: string | null;
  onTag: (tag: string | null) => void;
  currentSongId: string | null;
  loading: boolean;
  onPlayAll: () => void;
  onShuffle: () => void;
  onAddSong: () => void;
  onShare: () => void;
  onExport: () => void;
  onImport: () => void;
  onDeletePlaylist: () => void;
  onPlay: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDeleteSong: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
};

export function PlaylistDetail(props: Props) {
  const { playlist, songs, visibleSongs, filter, tags, activeTag, currentSongId } = props;
  const canEdit = playlist.role === 'owner' || playlist.role === 'editor';
  const isOwner = playlist.role === 'owner';
  const playable = songs.filter((song) => song.youtube_url).length;

  return (
    <>
      <header className="pl-head section">
        <Cover seed={playlist.id} name={playlist.name} songs={songs} />
        <div>
          <p className="pl-eyebrow">Playlist</p>
          <h1>{playlist.name}</h1>
          <div className="pl-meta">
            {playlist.description && <span>{playlist.description} ·</span>}
            <span>{songs.length} bài hát</span>
            <span className="badge">{ROLE_LABEL[playlist.role]}</span>
          </div>
        </div>
      </header>

      <div className="pl-actions">
        <button className="btn btn-primary btn-lg" type="button" onClick={props.onPlayAll} disabled={!playable}>
          <Play size={20} fill="currentColor" /> Phát tất cả
        </button>
        <button className="icon-btn icon-btn-lg" type="button" aria-label="Phát ngẫu nhiên" onClick={props.onShuffle} disabled={!playable}>
          <Shuffle size={20} />
        </button>
        {canEdit && (
          <button className="btn btn-lg" type="button" onClick={props.onAddSong}>
            <Plus size={19} /> Thêm bài
          </button>
        )}
        {isOwner && (
          <button className="icon-btn icon-btn-lg" type="button" aria-label="Chia sẻ playlist" onClick={props.onShare}>
            <Share2 size={20} />
          </button>
        )}
        <Menu
          label="Thêm tuỳ chọn"
          icon={<MoreHorizontal size={22} />}
          buttonClassName="icon-btn icon-btn-lg"
          items={[
            { label: 'Xuất ra file JSON', icon: <Download size={18} />, onClick: props.onExport },
            { label: 'Nhập từ file JSON', icon: <Upload size={18} />, onClick: props.onImport, hidden: !canEdit },
            { label: 'Xoá playlist', icon: <Trash2 size={18} />, onClick: props.onDeletePlaylist, danger: true, hidden: !isOwner },
          ]}
        />
      </div>

      {songs.length > 0 && (
        <div className="filter-bar">
          <div className="chip-row" role="group" aria-label="Lọc bài hát">
            {FILTERS.map(({ mode, label, count }) => (
              <button
                key={mode}
                className={filter === mode && !activeTag ? 'chip is-active' : 'chip'}
                type="button"
                aria-pressed={filter === mode && !activeTag}
                onClick={() => {
                  props.onTag(null);
                  props.onFilter(mode);
                }}
              >
                {label} <small>{count(songs)}</small>
              </button>
            ))}
            {tags.map(([tag, count]) => (
              <button
                key={tag}
                className={activeTag === tag ? 'chip is-active' : 'chip'}
                type="button"
                aria-pressed={activeTag === tag}
                onClick={() => {
                  props.onFilter('all');
                  props.onTag(activeTag === tag ? null : tag);
                }}
              >
                #{tag} <small>{count}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {props.loading ? (
        <SongRowSkeletons />
      ) : visibleSongs.length ? (
        <ul className="song-list" aria-label="Danh sách bài hát">
          {visibleSongs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              index={index}
              isCurrent={song.id === currentSongId}
              canEdit={canEdit}
              onPlay={props.onPlay}
              onEdit={props.onEdit}
              onDelete={props.onDeleteSong}
              onToggleFavorite={props.onToggleFavorite}
            />
          ))}
        </ul>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <Music2 size={30} />
          </span>
          <h3>{songs.length ? 'Không có bài nào khớp' : 'Playlist này chưa có bài hát'}</h3>
          <p>{songs.length ? 'Đổi bộ lọc hoặc từ khoá để xem các bài khác.' : 'Thêm bài đầu tiên với link YouTube để bắt đầu nghe.'}</p>
          {canEdit && !songs.length && (
            <button className="btn btn-primary" type="button" onClick={props.onAddSong} style={{ marginTop: 8 }}>
              <Plus size={18} /> Thêm bài
            </button>
          )}
        </div>
      )}
    </>
  );
}
