// Bọc YouTube IFrame API cho phòng nghe chung. Không khai báo lại window.YT (PlayerBar đã khai báo).

type YTPlayerInstance = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds: number }) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  stopVideo: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YTPlayerInstance;
};

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

// Mã lỗi của YouTube: 2 id sai, 5 lỗi HTML5, 100 không tìm thấy/riêng tư, 101 và 150 cấm nhúng.
export function describeYoutubeError(code: number) {
  if (code === 101 || code === 150) return 'Video không cho phép nhúng';
  if (code === 100) return 'Video không tồn tại hoặc ở chế độ riêng tư';
  return 'Không phát được video';
}

function getYT() {
  return (window as unknown as { YT?: YTNamespace }).YT;
}

let apiPromise: Promise<void> | null = null;

function loadYoutubeApi() {
  if (getYT()?.Player) return Promise.resolve();

  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    });
  }

  return apiPromise;
}

export type RoomPlayer = {
  load: (videoId: string, startSec: number) => void;
  cue: (videoId: string, startSec: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  getTime: () => number;
  getDuration: () => number;
  getState: () => number;
  destroy: () => void;
};

type Handlers = {
  onReady: () => void;
  onEnded: () => void;
  onError: (code: number) => void;
};

export async function createRoomPlayer(container: HTMLElement, handlers: Handlers): Promise<RoomPlayer> {
  await loadYoutubeApi();
  const YT = getYT()!;

  // YT.Player thay thế phần tử được truyền vào, nên tạo một phần tử con để giữ nguyên container.
  const mount = document.createElement('div');
  container.appendChild(mount);

  const player = await new Promise<YTPlayerInstance>((resolve) => {
    const instance: YTPlayerInstance = new YT.Player(mount, {
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0, // không để người nghe tự tua; điều khiển đi qua phòng
        disablekb: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          handlers.onReady();
          resolve(instance);
        },
        onStateChange: (event) => {
          if (event.data === YT_STATE.ENDED) handlers.onEnded();
        },
        onError: (event) => handlers.onError(event.data),
      },
    });
  });

  return {
    load: (videoId, startSec) => player.loadVideoById({ videoId, startSeconds: startSec }),
    cue: (videoId, startSec) => player.cueVideoById({ videoId, startSeconds: startSec }),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    stop: () => player.stopVideo(),
    seek: (sec) => player.seekTo(sec, true),
    getTime: () => player.getCurrentTime() || 0,
    getDuration: () => player.getDuration() || 0,
    getState: () => player.getPlayerState(),
    destroy: () => {
      player.destroy();
    },
  };
}
