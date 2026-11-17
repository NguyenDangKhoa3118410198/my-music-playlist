import { useEffect, useMemo, useState } from 'react';
import { ListMusic } from 'lucide-react';
import { getPlaylists } from '../../lib/playlistApi';
import { getAllSongs } from '../../lib/songApi';
import { getYoutubeVideoId } from '../../lib/youtube';
import { shuffled, songsToVideos } from '../../lib/playlistToRoom';
import type { BulkVideo } from '../../lib/roomApi';
import type { PlaylistWithRole, Song } from '../../types';
import { Cover } from '../ui/Cover';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';

type Props = {
  onClose: () => void;
  onImport: (videos: BulkVideo[]) => Promise<void>;
  /** Chủ phòng/DJ không bị giới hạn số bài chờ; người nghe thì có. */
  limitNote: string;
};

export function ImportPlaylistDialog({ onClose, onImport, limitNote }: Props) {
  const [playlists, setPlaylists] = useState<PlaylistWithRole[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPlaylists()
      .then(async (list) => {
        const all = await getAllSongs(list.map((playlist) => playlist.id));
        if (cancelled) return;
        setPlaylists(list);
        setSongs(all);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Không tải được playlist.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const playableByPlaylist = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const playlist of playlists) {
      map.set(playlist.id, songs.filter((song) => song.playlist_id === playlist.id && getYoutubeVideoId(song.youtube_url)));
    }
    return map;
  }, [playlists, songs]);

  const selectedSongs = selectedId ? (playableByPlaylist.get(selectedId) ?? []) : [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSongs.length) return;
    setBusy(true);
    setError('');
    try {
      const videos = songsToVideos(selectedSongs);
      await onImport(shuffle ? shuffled(videos) : videos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thêm được playlist.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Thêm từ playlist"
      subtitle="Chọn một playlist, các bài có link YouTube sẽ vào hàng đợi."
      onClose={onClose}
      onSubmit={handleSubmit}
      actions={
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !selectedSongs.length}>
          {busy && <Spinner size={18} />}
          {selectedSongs.length ? `Thêm ${selectedSongs.length} bài vào hàng đợi` : 'Chọn một playlist'}
        </button>
      }
    >
      {loading ? (
        <div className="empty">
          <Spinner size={26} label="Đang tải playlist" />
        </div>
      ) : playlists.length ? (
        <>
          <div className="import-list" role="radiogroup" aria-label="Playlist của bạn">
            {playlists.map((playlist) => {
              const own = playableByPlaylist.get(playlist.id) ?? [];
              const checked = playlist.id === selectedId;
              return (
                <button
                  key={playlist.id}
                  className={checked ? 'import-item is-selected' : 'import-item'}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={!own.length}
                  onClick={() => setSelectedId(playlist.id)}
                >
                  <Cover seed={playlist.id} name={playlist.name} songs={own} className="is-sm" />
                  <span>
                    <strong>{playlist.name}</strong>
                    <small>{own.length ? `${own.length} bài có thể phát` : 'Chưa có bài nào có link YouTube'}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
            Xáo trộn thứ tự bài
          </label>
          <p className="form-helper">{limitNote} Bài đã có trong hàng đợi sẽ được bỏ qua.</p>
        </>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <ListMusic size={26} />
          </span>
          <h3>Bạn chưa có playlist nào</h3>
          <p>Tạo playlist ở trang chủ rồi quay lại đây để thêm vào phòng.</p>
        </div>
      )}
      {error && <p className="form-message error">{error}</p>}
    </Dialog>
  );
}
