import { useCallback, useEffect, useRef, useState } from 'react';

// Chép văn bản vào clipboard và báo "đã chép" trong 2 giây.
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Trả về false khi trình duyệt chặn clipboard, để nơi gọi tự hiện cách khác.
  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    return true;
  }, []);

  return { copied, copy };
}
