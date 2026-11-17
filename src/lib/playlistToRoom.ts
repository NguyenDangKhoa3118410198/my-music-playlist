import { getVideoThumbnail, getYoutubeVideoId } from './youtube';
import type { BulkVideo } from './roomApi';
import type { Song } from '../types';

// Xáo trộn Fisher–Yates (không sửa mảng gốc).
export function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Bài trong playlist -> bài để thêm vào phòng. Bỏ qua bài chưa có link YouTube hợp lệ.
export function songsToVideos(songs: Song[]): BulkVideo[] {
  const videos: BulkVideo[] = [];
  for (const song of songs) {
    const videoId = getYoutubeVideoId(song.youtube_url);
    if (!videoId) continue;
    videos.push({
      videoId,
      title: song.artist ? `${song.title} - ${song.artist}` : song.title,
      thumbnail: getVideoThumbnail(videoId),
    });
  }
  return videos;
}
