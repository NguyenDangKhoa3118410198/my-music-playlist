import { useEffect, useState } from 'react';

// Thông báo ngắn ở góc màn hình, tự ẩn sau vài giây.
export function useToast(durationMs = 4000) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs]);

  return [message, setMessage] as const;
}
