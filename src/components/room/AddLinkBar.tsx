import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { errorMessage } from '../../lib/roomApi';
import {
  getYoutubeThumbnailUrl,
  getYoutubeVideoId,
  getYoutubeVideoInfo,
} from '../../lib/youtube';

export type NewVideo = { videoId: string; url: string; title: string; thumbnail: string | null };

export function AddLinkBar({ onAdd }: { onAdd: (video: NewVideo) => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmed = url.trim();
  const videoId = getYoutubeVideoId(trimmed);
  const thumbnail = getYoutubeThumbnailUrl(trimmed);

  // Lấy tiêu đề video để xem trước ngay khi dán link hợp lệ.
  useEffect(() => {
    setPreviewTitle('');
    if (!videoId) return undefined;

    let cancelled = false;
    getYoutubeVideoInfo(trimmed)
      .then((info) => {
        if (!cancelled && info) setPreviewTitle(info.title);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [videoId, trimmed]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!videoId) {
      setError('Hãy dán link YouTube hợp lệ.');
      return;
    }

    setBusy(true);
    try {
      let title = previewTitle;
      if (!title) title = (await getYoutubeVideoInfo(trimmed).catch(() => null))?.title || 'Video YouTube';
      await onAdd({ videoId, url: trimmed, title, thumbnail });
      setUrl('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="room-add" onSubmit={handleSubmit}>
      {videoId && (
        <div className="room-add-preview" aria-label="Xem trước bài sắp thêm">
          {thumbnail && <img src={thumbnail} alt="" />}
          <div className="room-add-preview-text">
            <span className="room-add-preview-label">Xem trước · chưa thêm vào hàng đợi</span>
            {previewTitle ? (
              <span className="room-add-preview-title">{previewTitle}</span>
            ) : (
              <span className="sk sk-inline" aria-label="Đang lấy tiêu đề" />
            )}
          </div>
        </div>
      )}
      {error && <p className="room-add-error">{error}</p>}
      <div className="room-add-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Dán link YouTube để thêm bài…"
          aria-label="Link YouTube"
          inputMode="url"
        />
        <button className="room-add-btn" type="submit" disabled={busy || !trimmed} aria-label="Thêm vào hàng đợi">
          <Plus size={20} />
        </button>
      </div>
    </form>
  );
}
