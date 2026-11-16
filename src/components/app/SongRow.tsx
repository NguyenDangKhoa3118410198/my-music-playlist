import { Edit3, ExternalLink, Heart, MoreHorizontal, Music, Play, Trash2 } from 'lucide-react';
import { getYoutubeThumbnailUrl } from '../../lib/youtube';
import type { Song } from '../../types';
import { Equalizer } from '../room/Equalizer';
import { Menu } from '../ui/Menu';

type Props = {
  song: Song;
  index: number;
  isCurrent: boolean;
  canEdit: boolean;
  /** Dòng phụ dưới tên bài; mặc định là ca sĩ. */
  subtitle?: string;
  onPlay: (song: Song) => void;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
};

export function SongRow({ song, index, isCurrent, canEdit, subtitle, onPlay, onEdit, onDelete, onToggleFavorite }: Props) {
  const thumb = getYoutubeThumbnailUrl(song.youtube_url);
  const playable = Boolean(song.youtube_url);

  return (
    <li className={isCurrent ? 'song-row is-current' : 'song-row'}>
      <span className="song-num">{isCurrent ? <Equalizer playing /> : index + 1}</span>
      <button
        className="song-thumb"
        type="button"
        disabled={!playable}
        onClick={() => onPlay(song)}
        aria-label={playable ? `Phát ${song.title}` : `${song.title} chưa có link YouTube`}
      >
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="thumb-empty"><Music size={20} /></span>}
        <span className="thumb-play">
          <Play size={20} fill="currentColor" />
        </span>
      </button>

      <div className="song-text">
        <strong>{song.title}</strong>
        <small>{subtitle ?? (song.artist || 'Chưa có ca sĩ')}</small>
      </div>

      <div className="song-tags">
        {song.key && <span className="tag">Tone {song.key}</span>}
        {song.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="tag">
            #{tag}
          </span>
        ))}
        {!playable && <span className="hint-chip">Thiếu link</span>}
      </div>

      <div className="song-actions">
        <button
          className={song.favorite ? 'icon-btn icon-btn-sm is-quiet fav-btn is-on' : 'icon-btn icon-btn-sm is-quiet fav-btn'}
          type="button"
          aria-label={song.favorite ? `Bỏ yêu thích ${song.title}` : `Yêu thích ${song.title}`}
          aria-pressed={song.favorite}
          disabled={!canEdit}
          onClick={() => onToggleFavorite(song)}
        >
          <Heart size={18} fill={song.favorite ? 'currentColor' : 'none'} />
        </button>
        <Menu
          label={`Thao tác với ${song.title}`}
          icon={<MoreHorizontal size={19} />}
          buttonClassName="icon-btn icon-btn-sm is-quiet"
          items={[
            { label: 'Mở trên YouTube', icon: <ExternalLink size={17} />, href: song.youtube_url ?? undefined, hidden: !song.youtube_url },
            { label: 'Sửa bài hát', icon: <Edit3 size={17} />, onClick: () => onEdit(song), hidden: !canEdit },
            { label: 'Xoá bài hát', icon: <Trash2 size={17} />, onClick: () => onDelete(song), danger: true, hidden: !canEdit },
          ]}
        />
      </div>
    </li>
  );
}
