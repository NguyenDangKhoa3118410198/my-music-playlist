import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Save, Star, X } from 'lucide-react';
import type { Song, SongInput } from '../types';
import { getYoutubeVideoInfo } from '../lib/youtube';

type Props = {
  song: Song | null;
  existingSongs: Song[];
  onCancel: () => void;
  onSubmit: (input: SongInput) => Promise<void>;
};

export function SongForm({ song, existingSongs, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [key, setKey] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [loadingYoutubeTitle, setLoadingYoutubeTitle] = useState(false);
  const [youtubeTitleMessage, setYoutubeTitleMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef('');
  const artistRef = useRef('');
  const autoFilledTitleRef = useRef('');
  const autoFilledArtistRef = useRef('');
  const youtubeUrlRef = useRef('');
  const metadataRequestRef = useRef(0);

  useEffect(() => {
    setTitle(song?.title || '');
    setArtist(song?.artist || '');
    setYoutubeUrl(song?.youtube_url || '');
    youtubeUrlRef.current = song?.youtube_url || '';
    setKey(song?.key || '');
    setTags(song?.tags.join(', ') || '');
    setNote(song?.note || '');
    setFavorite(song?.favorite || false);
    setShowMore(Boolean(song?.key || song?.tags.length || song?.note || song?.favorite));
    setYoutubeTitleMessage('');
    autoFilledTitleRef.current = '';
    autoFilledArtistRef.current = '';
    metadataRequestRef.current += 1;
    setError('');
  }, [song]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    artistRef.current = artist;
  }, [artist]);

  useEffect(() => {
    youtubeUrlRef.current = youtubeUrl;
  }, [youtubeUrl]);

  useEffect(() => {
    const cleanedUrl = youtubeUrl.trim();
    if (!cleanedUrl || !isLikelyYoutubeUrl(cleanedUrl)) return;

    const timer = window.setTimeout(() => {
      void fillMetadataFromYoutube(cleanedUrl);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [youtubeUrl]);

  const duplicate = useMemo(() => {
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedArtist = artist.trim().toLowerCase();

    if (!normalizedTitle) return null;

    return (
      existingSongs.find((item) => {
        if (item.id === song?.id) return false;
        return (
          item.title.trim().toLowerCase() === normalizedTitle &&
          (item.artist || '').trim().toLowerCase() === normalizedArtist
        );
      }) || null
    );
  }, [artist, existingSongs, song?.id, title]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Tên bài hát là bắt buộc.');
      return;
    }

    if (youtubeUrl.trim() && !isLikelyYoutubeUrl(youtubeUrl.trim())) {
      setError('Link YouTube chưa đúng định dạng.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title,
        artist,
        youtube_url: youtubeUrl,
        key,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        note,
        favorite,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không lưu được bài hát.');
    } finally {
      setSaving(false);
    }
  }

  async function fillMetadataFromYoutube(nextYoutubeUrl: string) {
    const cleanedUrl = nextYoutubeUrl.trim();
    if (!cleanedUrl || !isLikelyYoutubeUrl(cleanedUrl)) return;

    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;

    setLoadingYoutubeTitle(true);
    setYoutubeTitleMessage('');

    try {
      const youtubeInfo = await getYoutubeVideoInfo(cleanedUrl);
      if (metadataRequestRef.current !== requestId || youtubeUrlRef.current.trim() !== cleanedUrl) return;

      if (youtubeInfo) {
        const metadata = parseYoutubeSongMetadata(youtubeInfo.title, youtubeInfo.authorName);
        const canUpdateTitle =
          !titleRef.current.trim() || titleRef.current.trim() === autoFilledTitleRef.current;
        const canUpdateArtist =
          Boolean(metadata.artist) &&
          (!artistRef.current.trim() || artistRef.current.trim() === autoFilledArtistRef.current);
        const filledTitle = canUpdateTitle;
        const filledArtist = canUpdateArtist;

        if (filledTitle) {
          titleRef.current = metadata.title;
          autoFilledTitleRef.current = metadata.title;
          setTitle(metadata.title);
        }

        if (filledArtist && metadata.artist) {
          artistRef.current = metadata.artist;
          autoFilledArtistRef.current = metadata.artist;
          setArtist(metadata.artist);
        }

        if (filledTitle && filledArtist) {
          setYoutubeTitleMessage('Đã tự điền tên bài và ca sĩ từ YouTube.');
        } else if (filledTitle) {
          setYoutubeTitleMessage('Đã tự điền tên bài từ YouTube.');
        } else if (filledArtist) {
          setYoutubeTitleMessage('Đã tự điền ca sĩ từ YouTube.');
        }
      }
    } catch {
      setYoutubeTitleMessage('Chưa lấy được tên từ YouTube.');
    } finally {
      if (metadataRequestRef.current === requestId) {
        setLoadingYoutubeTitle(false);
      }
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="bottom-sheet song-modal" onSubmit={handleSubmit}>
        <div className="sheet-header song-modal-header">
          <div>
            <h2>{song ? 'Sửa bài hát' : 'Thêm bài hát'}</h2>
            <p>{song ? 'Cập nhật bài trong playlist' : 'Lưu bài karaoke mới'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} title="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className="song-modal-body">
          {duplicate && (
            <div className="notice">
              Có thể bị trùng với “{duplicate.title}”{duplicate.artist ? ` - ${duplicate.artist}` : ''}.
            </div>
          )}

          <div className="form-grid compact-form-grid">
            <label>
              Tên bài hát
              <input
                value={title}
                onChange={(event) => {
                  autoFilledTitleRef.current = '';
                  setTitle(event.target.value);
                }}
                placeholder="Nhập tên bài hát"
                required
              />
            </label>
            <label>
              Ca sĩ
              <input
                value={artist}
                onChange={(event) => {
                  autoFilledArtistRef.current = '';
                  setArtist(event.target.value);
                }}
                placeholder="Tên ca sĩ"
              />
            </label>
            <label>
              Link YouTube
              <input
                value={youtubeUrl}
                onBlur={(event) => void fillMetadataFromYoutube(event.target.value)}
                onChange={(event) => {
                  youtubeUrlRef.current = event.target.value;
                  setYoutubeUrl(event.target.value);
                  setYoutubeTitleMessage('');
                }}
                onPaste={(event) => {
                  const pastedUrl = event.clipboardData.getData('text');
                  youtubeUrlRef.current = pastedUrl;
                  window.setTimeout(() => void fillMetadataFromYoutube(pastedUrl), 0);
                }}
                placeholder="https://youtube.com/watch?v=..."
              />
            </label>
          </div>

          {(loadingYoutubeTitle || youtubeTitleMessage) && (
            <p className="form-helper">
              {loadingYoutubeTitle ? 'Đang lấy tên bài từ YouTube...' : youtubeTitleMessage}
            </p>
          )}

          <div className="song-form-toolbar">
            <button className="more-toggle" type="button" onClick={() => setShowMore((current) => !current)}>
              Tùy chọn
              <ChevronDown size={18} className={showMore ? 'rotate' : ''} />
            </button>
            <button
              className={favorite ? 'favorite-toggle song-favorite-toggle active' : 'favorite-toggle song-favorite-toggle'}
              type="button"
              onClick={() => setFavorite((current) => !current)}
              aria-pressed={favorite}
            >
              <Star size={18} fill={favorite ? 'currentColor' : 'none'} />
              {favorite ? 'Đã yêu thích' : 'Yêu thích'}
            </button>
          </div>

          {showMore && (
            <div className="advanced-fields">
              <label>
                Tone
                <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="Nam, Nữ, Am..." />
              </label>
              <label>
                Tags
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="bolero, song ca" />
              </label>
              <label>
                Ghi chú
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
              </label>
            </div>
          )}

          {error && <p className="form-message error">{error}</p>}
        </div>

        <div className="sheet-actions song-modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            Hủy
          </button>
          <button className="primary-button" type="submit" disabled={saving || !title.trim()}>
            <Save size={18} />
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  );
}

function isLikelyYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname);
  } catch {
    return false;
  }
}

function cleanYoutubeTitle(value: string) {
  return value
    .replace(/\s*\|\s*karaoke.*$/i, '')
    .replace(/\s*-\s*karaoke.*$/i, '')
    .replace(/\s*\(karaoke.*?\)\s*/gi, ' ')
    .replace(/\s*\[karaoke.*?\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseYoutubeSongMetadata(rawTitle: string, authorName: string | null) {
  const normalizedTitle = rawTitle.replace(/\s+/g, ' ').trim();
  const parsed = splitTitleAndArtist(normalizedTitle);
  const fallbackArtist = cleanYoutubeArtist(authorName);

  return {
    title: cleanYoutubeTitle(parsed?.title || normalizedTitle),
    artist: parsed?.artist || fallbackArtist,
  };
}

function splitTitleAndArtist(value: string) {
  const separators = [' - ', ' – ', ' — ', ' | '];

  for (const separator of separators) {
    const parts = value.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const [left, ...rightParts] = parts;
    const right = rightParts.join(separator);

    if (looksLikeSongSuffix(left, right)) continue;

    return {
      title: left,
      artist: cleanYoutubeArtist(right),
    };
  }

  return null;
}

function looksLikeSongSuffix(left: string, right: string) {
  const leftLower = left.toLowerCase();
  const rightLower = right.toLowerCase();
  const utilityWords = ['karaoke', 'tone', 'beat', 'instrumental', 'lyrics', 'nhạc sống', 'nhac song'];

  return (
    utilityWords.some((word) => leftLower.includes(word)) ||
    utilityWords.some((word) => rightLower.includes(word))
  );
}

function cleanYoutubeArtist(value?: string | null) {
  if (!value) return '';

  const cleaned = value
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*official\s*$/i, '')
    .replace(/\s*vevo\s*$/i, '')
    .replace(/\s*channel\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /karaoke|beat|instrumental|lyrics|nhạc sống|nhac song|tone/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}
