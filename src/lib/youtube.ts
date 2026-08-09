export type YoutubeVideoInfo = {
  title: string;
  authorName: string | null;
};

export function getYoutubeEmbedUrl(value?: string | null) {
  const id = getYoutubeVideoId(value);
  if (!id) return null;

  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
  });

  if (typeof window !== 'undefined') {
    params.set('origin', window.location.origin);
  }

  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function getYoutubeThumbnailUrl(value?: string | null) {
  const id = getYoutubeVideoId(value);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export async function getYoutubeVideoTitle(value: string) {
  const info = await getYoutubeVideoInfo(value);
  return info?.title || null;
}

export async function getYoutubeVideoInfo(value: string): Promise<YoutubeVideoInfo | null> {
  const videoId = getYoutubeVideoId(value);
  if (!videoId) return null;

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = new URL('https://www.youtube.com/oembed');
  oembedUrl.searchParams.set('url', videoUrl);
  oembedUrl.searchParams.set('format', 'json');

  const response = await fetch(oembedUrl);
  if (!response.ok) return null;

  const data = (await response.json()) as { title?: string; author_name?: string };
  const title = data.title?.trim();

  if (!title) return null;

  return {
    title,
    authorName: data.author_name?.trim() || null,
  };
}

export function getYoutubeVideoId(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.hostname === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }

      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/').filter(Boolean)[1] || null;
      }

      return url.searchParams.get('v');
    }
  } catch {
    return null;
  }

  return null;
}
