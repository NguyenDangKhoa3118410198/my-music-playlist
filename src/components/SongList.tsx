import type { Song } from '../types';
import { SongCard } from './SongCard';

type Props = {
  songs: Song[];
  canEdit: boolean;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onPlay: (song: Song) => void;
};

export function SongList({ songs, canEdit, onEdit, onDelete, onPlay }: Props) {
  if (!songs.length) {
    return (
      <div className="empty-state">
        <h3>Chưa có bài nào khớp</h3>
        <p>Thêm bài đầu tiên hoặc đổi bộ lọc để thấy danh sách karaoke của bạn.</p>
      </div>
    );
  }

  return (
    <div className="song-list">
      {songs.map((song) => (
        <SongCard
          key={song.id}
          song={song}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
          onPlay={onPlay}
        />
      ))}
    </div>
  );
}
