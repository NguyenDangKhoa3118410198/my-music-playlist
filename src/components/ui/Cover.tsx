import type { CSSProperties } from 'react';
import { getYoutubeThumbnailUrl } from '../../lib/youtube';
import type { Song } from '../../types';

const GRADIENTS = [
  ['#0d9488', '#312e81'],
  ['#db2777', '#4c1d95'],
  ['#0891b2', '#1e3a8a'],
  ['#ea580c', '#9f1239'],
  ['#16a34a', '#0f766e'],
  ['#7c3aed', '#be185d'],
];

function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

type Props = {
  seed: string;
  name: string;
  songs: Pick<Song, 'youtube_url'>[];
  className?: string;
};

// Bìa playlist: ảnh ghép 2x2 từ các bài hát, ít ảnh hơn thì dùng một ảnh, chưa có thì gradient + chữ cái đầu.
export function Cover({ seed, name, songs, className = '' }: Props) {
  const thumbs = Array.from(
    new Set(songs.map((song) => getYoutubeThumbnailUrl(song.youtube_url)).filter((url): url is string => Boolean(url))),
  );
  const style = { '--cover-bg': gradientFor(seed) } as CSSProperties;

  return (
    <div className={`cover ${className}`.trim()} style={style} aria-hidden="true">
      {thumbs.length >= 4 ? (
        <div className="cover-grid">
          {thumbs.slice(0, 4).map((url) => (
            <img key={url} src={url} alt="" loading="lazy" />
          ))}
        </div>
      ) : thumbs.length > 0 ? (
        <div className="cover-grid is-single">
          <img src={thumbs[0]} alt="" loading="lazy" />
        </div>
      ) : (
        <div className="cover-initial">{(name.trim()[0] || '♪').toUpperCase()}</div>
      )}
    </div>
  );
}
