import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoomMembers, getRoomQueue, getRoomState } from '../lib/roomApi';
import { supabase } from '../lib/supabase';
import type { RoomMember, RoomQueueItem, RoomState } from '../types';

// Nguồn sự thật: room_state và room_queue trong Postgres, đẩy xuống qua Realtime.
// Realtime có thể rớt gói, nên ngoài việc nghe sự kiện còn tải lại khi quay lại tab và định kỳ.
const POLL_INTERVAL_MS = 15_000;

export function useRoomRealtime(roomId: string | null, userId: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [queue, setQueue] = useState<RoomQueueItem[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const aliveRef = useRef(true);

  // Chỉ nhận trạng thái mới hơn, để một phản hồi đến muộn không ghi đè trạng thái đã mới.
  const applyState = useCallback((next: RoomState) => {
    setState((prev) => (prev && prev.version > next.version ? prev : next));
  }, []);

  const refreshState = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomState(roomId);
      if (aliveRef.current) applyState(next);
    } catch (e) {
      if (aliveRef.current) setError(e instanceof Error ? e.message : 'Không tải được trạng thái phòng.');
    }
  }, [roomId, applyState]);

  const refreshQueue = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomQueue(roomId);
      if (aliveRef.current) setQueue(next);
    } catch {
      /* lần tải sau sẽ thử lại */
    }
  }, [roomId]);

  const refreshMembers = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomMembers(roomId);
      if (aliveRef.current) setMembers(next);
    } catch {
      /* lần tải sau sẽ thử lại */
    }
  }, [roomId]);

  useEffect(() => {
    aliveRef.current = true;
    if (!roomId) return undefined;

    const loadAll = () => Promise.all([refreshState(), refreshQueue(), refreshMembers()]);

    // Tải ngay, không chờ Realtime: nếu kênh kết nối chậm hoặc lỗi thì màn hình vẫn có dữ liệu.
    void loadAll();

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_state', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const next = payload.new as Partial<RoomState>;
          if (next && typeof next.version === 'number') applyState(next as RoomState);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_queue', filter: `room_id=eq.${roomId}` },
        () => void refreshQueue(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => void refreshMembers(),
      )
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          void channel.track({ online_at: new Date().toISOString() });
          // Tải sau khi đã đăng ký kênh để không bỏ lỡ thay đổi xảy ra giữa chừng.
          void loadAll();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Dự phòng khi Realtime rớt gói hoặc mất kết nối: định kỳ tải lại cả trạng thái, hàng đợi và thành viên.
    const poll = window.setInterval(() => void loadAll(), POLL_INTERVAL_MS);

    return () => {
      aliveRef.current = false;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, applyState, refreshState, refreshQueue, refreshMembers]);

  return { state, queue, members, onlineIds, connected, error, applyState, refreshState };
}
