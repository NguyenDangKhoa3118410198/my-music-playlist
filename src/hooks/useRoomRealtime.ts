import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoomHistory, getRoomHistoryCount, getRoomMembers, getRoomQueue, getRoomState } from '../lib/roomApi';
import { supabase } from '../lib/supabase';
import type { RoomMember, RoomQueueItem, RoomState } from '../types';

// Nguồn sự thật: room_state và room_queue trong Postgres, đẩy xuống qua Realtime.
// Realtime có thể rớt gói, nên ngoài việc nghe sự kiện còn tải lại khi quay lại tab và định kỳ.
//
// Tải lại định kỳ tốn băng thông (gói Free của Supabase chỉ có 5 GB/tháng) nên:
//  - Realtime đang kết nối tốt: chỉ tải lại thưa (mỗi 90 giây) như một lớp bảo hiểm cho sự kiện bị rơi.
//  - Realtime mất kết nối: tải lại dày (mỗi 15 giây) để phòng vẫn dùng được.
//  - Danh sách lịch sử (nặng nhất) chỉ tải khi tab "Đã phát" đang mở; nhãn tab chỉ dùng một yêu cầu đếm nhẹ.
const POLL_TICK_MS = 15_000;
const CONNECTED_POLL_EVERY_TICKS = 6; // 6 x 15s = 90s

type Options = {
  /** Tab "Đã phát" đang mở: chỉ khi đó mới tải danh sách lịch sử. */
  historyOpen?: boolean;
};

export function useRoomRealtime(roomId: string | null, userId: string, { historyOpen = false }: Options = {}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [queue, setQueue] = useState<RoomQueueItem[]>([]);
  const [history, setHistory] = useState<RoomQueueItem[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [closed, setClosed] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);
  const historyOpenRef = useRef(historyOpen);
  historyOpenRef.current = historyOpen;

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

  const refreshHistory = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomHistory(roomId);
      if (aliveRef.current) setHistory(next);
    } catch {
      /* lần tải sau sẽ thử lại */
    }
  }, [roomId]);

  const refreshHistoryCount = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomHistoryCount(roomId);
      if (aliveRef.current) setHistoryCount(next);
    } catch {
      /* lần tải sau sẽ thử lại */
    }
  }, [roomId]);

  // Luôn cập nhật số đếm (nhẹ); chỉ tải cả danh sách khi tab đang mở.
  const refreshHistoryMaybe = useCallback(
    () => (historyOpenRef.current ? Promise.all([refreshHistory(), refreshHistoryCount()]) : refreshHistoryCount()),
    [refreshHistory, refreshHistoryCount],
  );

  const refreshMembers = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await getRoomMembers(roomId);
      if (aliveRef.current) setMembers(next);
    } catch {
      /* lần tải sau sẽ thử lại */
    }
  }, [roomId]);

  // Mở tab "Đã phát" thì tải danh sách ngay.
  useEffect(() => {
    if (historyOpen) void refreshHistory();
  }, [historyOpen, refreshHistory]);

  useEffect(() => {
    aliveRef.current = true;
    if (!roomId) return undefined;

    const loadAll = () => Promise.all([refreshState(), refreshQueue(), refreshHistoryMaybe(), refreshMembers()]);

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
        // Hàng đợi và lịch sử cùng nằm trong room_queue: một sự kiện có thể đổi cả hai (bài chuyển từ chờ sang đã phát).
        () => void Promise.all([refreshQueue(), refreshHistoryMaybe()]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => void refreshMembers(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if ((payload.new as { closed_at?: string | null }).closed_at) setClosed(true);
        },
      )
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        connectedRef.current = status === 'SUBSCRIBED';
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
    // Đồng hồ chạy mỗi 15 giây; đang kết nối tốt thì bỏ qua 5 trên 6 nhịp.
    let tick = 0;
    const poll = window.setInterval(() => {
      tick += 1;
      if (connectedRef.current && tick % CONNECTED_POLL_EVERY_TICKS !== 0) return;
      void loadAll();
    }, POLL_TICK_MS);

    return () => {
      aliveRef.current = false;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, applyState, refreshState, refreshQueue, refreshHistoryMaybe, refreshMembers]);

  return { state, queue, history, historyCount, members, onlineIds, connected, closed, error, applyState, refreshState };
}
