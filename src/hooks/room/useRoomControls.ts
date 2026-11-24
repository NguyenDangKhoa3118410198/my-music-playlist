import { useCallback } from 'react';
import { serverNow } from '../../lib/clock';
import {
  errorMessage,
  isVersionConflict,
  nextInRoom,
  pauseRoom,
  playRoom,
  removeFromQueue,
  reorderQueue,
  seekRoom,
  setMemberRole,
} from '../../lib/roomApi';
import { expectedPosition } from '../../lib/syncMath';
import { describeYoutubeError } from '../../lib/youtubePlayer';
import type { Room, RoomMember, RoomQueueItem, RoomState } from '../../types';
import { toAnchor } from '../useSyncedPlayer';

type Args = {
  room: Room | null;
  state: RoomState | null;
  queue: RoomQueueItem[];
  applyState: (state: RoomState) => void;
  refreshState: () => Promise<void>;
  mutateQueue: (change: (queue: RoomQueueItem[]) => RoomQueueItem[], action: () => Promise<unknown>) => Promise<void>;
  notify: (message: string) => void;
};

// Các lệnh điều khiển phòng: phát/tạm dừng/tua/chuyển bài, sửa hàng đợi, đổi vai trò, và xử lý khi bài hết hoặc lỗi.
export function useRoomControls({ room, state, queue, applyState, refreshState, mutateQueue, notify }: Args) {
  // Mọi thao tác điều khiển đi qua đây: cập nhật ngay bằng kết quả trả về, xử lý xung đột phiên bản.
  const run = useCallback(
    async (action: () => Promise<RoomState | void>) => {
      try {
        const result = await action();
        if (result) applyState(result);
      } catch (e) {
        if (isVersionConflict(e)) {
          await refreshState();
          notify('Trạng thái phòng vừa thay đổi, đã cập nhật lại.');
        } else {
          notify(errorMessage(e));
        }
      }
    },
    [applyState, refreshState, notify],
  );

  const onEnded = useCallback(
    (queueId: string) => {
      if (room) void nextInRoom(room.id, queueId, 'ended').then(applyState).catch(() => undefined);
    },
    [room, applyState],
  );

  const onError = useCallback(
    (queueId: string, errorCode: number) => {
      if (!room) return;
      const title = queue.find((item) => item.id === queueId)?.title;
      notify(`${describeYoutubeError(errorCode)}${title ? ` (“${title}”)` : ''}, đã bỏ qua bài này.`);
      void nextInRoom(room.id, queueId, 'unplayable').then(applyState).catch(() => undefined);
    },
    [room, applyState, queue, notify],
  );

  function togglePlay() {
    if (!room || !state) return;
    const position = expectedPosition(toAnchor(state), serverNow());
    void run(() =>
      state.status === 'playing'
        ? pauseRoom(room.id, position, state.version)
        : playRoom(room.id, position, state.version),
    );
  }

  function skip() {
    if (!room || !state?.current_queue_id) return;
    const queueId = state.current_queue_id;
    void run(() => nextInRoom(room.id, queueId, 'skip'));
  }

  function seek(position: number) {
    if (!room || !state) return;
    void run(() => seekRoom(room.id, position, state.version));
  }

  function remove(item: RoomQueueItem) {
    if (!room) return;
    // Xoá bài đang phát thì máy chủ chuyển sang bài kế: để luồng đồng bộ lo, không gỡ trước (player sẽ dừng hụt).
    if (item.id === state?.current_queue_id) {
      void run(() => removeFromQueue(room.id, item.id));
      return;
    }
    void run(() =>
      mutateQueue(
        (list) => list.filter((candidate) => candidate.id !== item.id),
        () => removeFromQueue(room.id, item.id),
      ),
    );
  }

  function reorder(item: RoomQueueItem, position: number) {
    if (!room) return;
    void run(() =>
      mutateQueue(
        (list) =>
          list
            .map((candidate) => (candidate.id === item.id ? { ...candidate, position } : candidate))
            .sort((a, b) => a.position - b.position),
        () => reorderQueue(room.id, item.id, position),
      ),
    );
  }

  function setRole(member: RoomMember, role: 'dj' | 'listener') {
    if (room) void run(() => setMemberRole(room.id, member.user_id, role));
  }

  return { onEnded, onError, togglePlay, skip, seek, remove, reorder, setRole };
}
