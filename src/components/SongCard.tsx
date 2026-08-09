import { Edit3, ExternalLink, Music, Play, Star, Trash2 } from 'lucide-react';
import type { Song } from '../types';
import { getYoutubeThumbnailUrl } from '../lib/youtube';

type Props = {
  song: Song;
  canEdit: boolean;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onPlay: (song: Song) => void;
};

export function SongCard({ song, canEdit, onEdit, onDelete, onPlay }: Props) {
  const thumbnailUrl = getYoutubeThumbnailUrl(song.youtube_url);

  return (
    <article className="song-card">
      <button
        className="song-thumbnail"
        type="button"
        onClick={() => onPlay(song)}
        disabled={!song.youtube_url}
        title={song.youtube_url ? 'Phát bài hát' : 'Chưa có link YouTube'}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <Music size={20} />
        )}
        {song.youtube_url && <Play className="song-thumbnail-play" size={18} fill="currentColor" />}
      </button>
      <div className="song-main">
        <div className="song-title-row">
          <h3>{song.title}</h3>
          {song.favorite && (
            <span className="favorite-badge" title="Yêu thích">
              <Star size={15} fill="currentColor" />
            </span>
          )}
        </div>
        <p>{song.artist || 'Chưa có ca sĩ'}</p>
        <div className="song-meta">
          {song.key && <span>Tone {song.key}</span>}
          {song.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        {song.note && <p className="song-note">{song.note}</p>}
      </div>
      <div className="song-actions">
        <button
          className="icon-button primary-icon"
          type="button"
          onClick={() => onPlay(song)}
          disabled={!song.youtube_url}
          title={song.youtube_url ? 'Phát bài hát' : 'Chưa có link YouTube'}
        >
          <Play size={18} fill="currentColor" />
        </button>
        {song.youtube_url ? (
          <a className="icon-button" href={song.youtube_url} target="_blank" rel="noreferrer" title="Mở YouTube">
            <ExternalLink size={18} />
          </a>
        ) : (
          <span className="icon-button disabled" title="Chưa có link YouTube">
            <Music size={18} />
          </span>
        )}
        {canEdit && (
          <>
            <button className="icon-button" type="button" onClick={() => onEdit(song)} title="Sửa bài">
              <Edit3 size={18} />
            </button>
            <button className="icon-button danger" type="button" onClick={() => onDelete(song)} title="Xóa bài">
              <Trash2 size={18} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
