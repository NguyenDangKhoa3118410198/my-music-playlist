import { useCallback, useEffect, useState } from 'react';

// Tắt tiếng chỉ cho riêng máy này, tạm thời: không lưu lại, tải lại trang là bật tiếng như mặc định.
// Phím tắt M (không kích hoạt khi đang gõ vào ô nhập).
export function useLocalMute() {
  const [muted, setMuted] = useState(false);
  const toggleMute = useCallback(() => setMuted((current) => !current), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      toggleMute();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleMute]);

  return { muted, setMuted, toggleMute };
}
