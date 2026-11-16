// Hàm thuần cho việc đồng bộ phát nhạc. Không phụ thuộc React hay trình duyệt để test được.
//
// Trạng thái phòng lưu một "mốc neo": vị trí (giây) tại giờ server anchorAtMs.
//   playing: vị trí = anchorPos + (giờ server hiện tại - anchorAtMs)
//   paused : vị trí = anchorPos

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export type PlaybackAnchor = {
  status: PlaybackStatus;
  anchorPos: number;
  anchorAtMs: number;
};

export type ClockSample = {
  sentAtMs: number;
  receivedAtMs: number;
  serverMs: number;
};

// Lệch quá ngưỡng này mới seek, để người nghe không bị giật vì sai số nhỏ.
export const SEEK_THRESHOLD_SEC = 2;

export function expectedPosition(anchor: PlaybackAnchor, serverNowMs: number): number {
  if (anchor.status === 'playing') {
    return Math.max(0, anchor.anchorPos + (serverNowMs - anchor.anchorAtMs) / 1000);
  }
  return Math.max(0, anchor.anchorPos);
}

export function needsSeek(
  actualSec: number,
  expectedSec: number,
  thresholdSec: number = SEEK_THRESHOLD_SEC,
): boolean {
  return Math.abs(actualSec - expectedSec) > thresholdSec;
}

// Độ lệch giữa đồng hồ máy và đồng hồ server (ms), cộng vào Date.now() để ra giờ server.
// Mẫu có thời gian khứ hồi (RTT) nhỏ nhất là mẫu đáng tin nhất; giả định server trả lời ở giữa RTT.
export function estimateClockOffset(samples: ClockSample[]): number {
  const valid = samples.filter((sample) => sample.receivedAtMs >= sample.sentAtMs);
  if (!valid.length) return 0;

  const best = valid.reduce((a, b) =>
    b.receivedAtMs - b.sentAtMs < a.receivedAtMs - a.sentAtMs ? b : a,
  );
  const rtt = best.receivedAtMs - best.sentAtMs;
  return best.serverMs + rtt / 2 - best.receivedAtMs;
}

// Timestamp từ Postgres/Realtime có thể là "2026-11-16 10:00:00.5+00", "...T10:00:00.5+00:00" hoặc
// thiếu múi giờ. Thiếu múi giờ thì Date.parse hiểu là giờ máy -> lệch nhiều giờ -> player tua loạn.
export function parseServerTimestamp(value: string): number {
  let text = value.trim().replace(' ', 'T');
  if (/[+-]\d{2}$/.test(text)) text += ':00';
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) text += 'Z';
  return Date.parse(text);
}

// Vị trí để chèn một bài giữa hai bài kề nhau trong hàng đợi.
export function positionBetween(before: number | null, after: number | null): number {
  if (before !== null && after !== null) return (before + after) / 2;
  if (before !== null) return before + 1;
  if (after !== null) return after - 1;
  return 1;
}
