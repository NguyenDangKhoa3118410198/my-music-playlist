import { supabase } from './supabase';
import { estimateClockOffset, type ClockSample } from './syncMath';

let offsetMs = 0;

// Giờ server ước tính. Dùng thay Date.now() khi tính vị trí phát.
export function serverNow() {
  return Date.now() + offsetMs;
}

// Đo độ lệch đồng hồ máy so với server bằng vài lần gọi server_time(), lấy mẫu RTT nhỏ nhất.
export async function syncServerClock(attempts = 5) {
  const samples: ClockSample[] = [];

  for (let i = 0; i < attempts; i += 1) {
    const sentAtMs = Date.now();
    const { data, error } = await supabase.rpc('server_time');
    const receivedAtMs = Date.now();
    if (error || typeof data !== 'string') continue;
    samples.push({ sentAtMs, receivedAtMs, serverMs: Date.parse(data) });
  }

  offsetMs = estimateClockOffset(samples);
  return offsetMs;
}
