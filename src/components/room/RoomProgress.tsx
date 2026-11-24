import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

function formatTime(sec: number) {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type Props = {
  progress: { time: number; duration: number };
  disabled: boolean;
  onSeek: (position: number) => void;
  muted: boolean;
  onToggleMute: () => void;
};

// Thanh tua + nút tắt tiếng.
// Gửi lệnh tua đúng một lần cho mỗi lần kéo/bấm. Giữ vị trí đã chọn trên thanh tua cho tới khi
// player bắt kịp (hoặc quá hạn), để thanh không giật ngược về vị trí cũ.
export function RoomProgress({ progress, disabled, onSeek, muted, onToggleMute }: Props) {
  const [seeking, setSeeking] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const seekDeadlineRef = useRef(0);
  const keyboardCommitRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(keyboardCommitRef.current), []);

  // Thả vị trí tạm khi player đã tới nơi, hoặc quá hạn.
  useEffect(() => {
    if (seeking === null || draggingRef.current) return;
    if (Math.abs(progress.time - seeking) < 1.5 || Date.now() > seekDeadlineRef.current) setSeeking(null);
  }, [seeking, progress]);

  function commitSeek(position: number) {
    seekDeadlineRef.current = Date.now() + 3000;
    setSeeking(position);
    onSeek(position);
  }

  function handleChange(value: number) {
    setSeeking(value);
    // Bàn phím không có "nhả chuột": gom các lần đổi liên tiếp rồi gửi một lần.
    if (!draggingRef.current) {
      window.clearTimeout(keyboardCommitRef.current);
      keyboardCommitRef.current = window.setTimeout(() => commitSeek(value), 500);
    }
  }

  function handleEnd(value: number) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    commitSeek(value);
  }

  const shownTime = seeking ?? progress.time;
  const duration = Math.max(progress.duration, 1);
  const fill = Math.min(100, (Math.min(shownTime, duration) / duration) * 100);

  return (
    <div className="room-progress">
      <span>{formatTime(shownTime)}</span>
      <input
        type="range"
        min={0}
        max={duration}
        step={1}
        value={Math.min(shownTime, duration)}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        disabled={disabled}
        onPointerDown={() => {
          draggingRef.current = true;
        }}
        onChange={(event) => handleChange(Number(event.target.value))}
        onPointerUp={(event) => handleEnd(Number(event.currentTarget.value))}
        onPointerCancel={() => {
          draggingRef.current = false;
          setSeeking(null);
        }}
        aria-label="Tua bài hát"
      />
      <span>{formatTime(progress.duration)}</span>
      <button
        className={muted ? 'icon-btn is-active' : 'icon-btn'}
        type="button"
        aria-pressed={muted}
        aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
        title={muted ? 'Bật tiếng (M)' : 'Tắt tiếng trên máy này (M)'}
        onClick={onToggleMute}
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
  );
}
