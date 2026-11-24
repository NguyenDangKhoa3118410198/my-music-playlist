import { useEffect, useState } from 'react';

// Chế độ màn hình lớn: dùng khi một máy nối TV/loa, mọi người quét QR để thêm bài từ điện thoại.
// Bật thì vào toàn màn hình + giữ màn hình sáng. Cả hai đều có thể bị trình duyệt từ chối, khi đó vẫn dùng được.
// Thoát khi rời toàn màn hình hoặc nhấn Esc.
export function useTvMode() {
  const [tv, setTv] = useState(false);

  useEffect(() => {
    if (!tv) return undefined;
    let lock: WakeLockSentinel | null = null;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    void navigator.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        lock = sentinel;
      })
      .catch(() => undefined);

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTv(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKey);
      void lock?.release().catch(() => undefined);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [tv]);

  return [tv, setTv] as const;
}
