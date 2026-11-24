import { useEffect } from 'react';
import { pingRoom, settleRoom } from '../../lib/roomApi';
import type { RoomState } from '../../types';

// Nhịp tim: cho server biết còn người nghe. Thưa hơn ngưỡng 120 giây của server để một lần mất gói không bị coi là bỏ đi.
const HEARTBEAT_MS = 45_000;

// Vào phòng: dọn trạng thái "đang phát" cũ nếu lâu không ai nghe (server tạm dừng lại), rồi ping định kỳ.
// Thứ tự quan trọng: settle TRƯỚC ping, vì ping của chính mình sẽ làm phòng trông như "đang có người".
export function useRoomHeartbeat(roomId: string | null, closed: boolean, applyState: (state: RoomState) => void) {
  useEffect(() => {
    if (!roomId || closed) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        const settled = await settleRoom(roomId);
        if (!cancelled) applyState(settled);
      } catch {
        /* không chặn việc vào phòng */
      }
      await pingRoom(roomId).catch(() => undefined);
    })();

    // Không dừng ping khi tab ẩn: người nghe nhạc nền vẫn là "đang nghe".
    const timer = window.setInterval(() => void pingRoom(roomId).catch(() => undefined), HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roomId, closed, applyState]);
}
