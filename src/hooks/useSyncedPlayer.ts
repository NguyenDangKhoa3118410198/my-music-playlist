import { type RefObject, useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib/clock';
import { expectedPosition, needsSeek, parseServerTimestamp, type PlaybackAnchor } from '../lib/syncMath';
import { createRoomPlayer, YT_STATE, type RoomPlayer } from '../lib/youtubePlayer';
import type { RoomQueueItem, RoomState } from '../types';

const DRIFT_CHECK_MS = 2000;
const PROGRESS_TICK_MS = 500;
const PAUSE_GUARD_MS = 700;
// Sau khi tua/tải bài, getCurrentTime chưa đáng tin (đang buffer): tạm không sửa lệch.
const SETTLE_MS = 3000;
// Sau khi player báo lỗi, chờ chừng này rồi mới kết luận (xem comment ở onError).
const ERROR_CONFIRM_MS = 1200;

type Args = {
  containerRef: RefObject<HTMLDivElement | null>;
  // Khung chứa player chỉ tồn tại sau khi phòng tải xong; chỉ tạo player khi enabled = true.
  enabled: boolean;
  state: RoomState | null;
  current: RoomQueueItem | null;
  // Chỉ phát sau khi người dùng bấm "Tham gia nghe" (trình duyệt chặn autoplay).
  joined: boolean;
  // Tắt tiếng cá nhân: chỉ ảnh hưởng máy này, không gửi lên phòng.
  muted: boolean;
  onEnded: (queueId: string) => void;
  onError: (queueId: string, code: number) => void;
};

export function toAnchor(state: RoomState): PlaybackAnchor {
  return {
    status: state.status,
    anchorPos: state.anchor_pos,
    anchorAtMs: parseServerTimestamp(state.anchor_at),
  };
}

export function useSyncedPlayer({ containerRef, enabled, state, current, joined, muted, onEnded, onError }: Args) {
  const playerRef = useRef<RoomPlayer | null>(null);
  const loadedQueueIdRef = useRef<string | null>(null);
  const settleUntilRef = useRef(0);
  const callbacksRef = useRef({ onEnded, onError });
  callbacksRef.current = { onEnded, onError };

  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState({ time: 0, duration: 0 });

  // Tạo player một lần cho cả vòng đời trang phòng.
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return undefined;

    let disposed = false;
    let created: RoomPlayer | null = null;

    void createRoomPlayer(container, {
      onReady: () => undefined,
      onEnded: () => {
        const id = loadedQueueIdRef.current;
        if (id) callbacksRef.current.onEnded(id);
      },
      onError: (code) => {
        const id = loadedQueueIdRef.current;
        if (!id) return;

        // Sự kiện lỗi có thể đến MUỘN: lỗi của bài trước đến sau khi bài kế đã được tải (ví dụ máy khác đã
        // bỏ qua bài lỗi, ta nhận cập nhật rồi tải bài mới, rồi mới nhận lỗi cũ). Nếu bỏ qua ngay thì bài kế
        // đang phát tốt cũng bị gán lỗi và bỏ qua, cứ thế xoá dây chuyền cả hàng đợi.
        // Nên chờ một chút rồi xác nhận: vẫn đúng bài đó VÀ player thực sự không phát (chưa bắt đầu/đã cue).
        window.setTimeout(() => {
          const player = playerRef.current;
          if (!player || loadedQueueIdRef.current !== id) return; // đã chuyển bài, lỗi này là của bài cũ
          const playerState = player.getState();
          if (
            playerState === YT_STATE.PLAYING ||
            playerState === YT_STATE.BUFFERING ||
            playerState === YT_STATE.PAUSED
          ) {
            return; // bài hiện tại đang phát được, lỗi này là của video trước
          }
          callbacksRef.current.onError(id, code);
        }, ERROR_CONFIRM_MS);
      },
    }).then((player) => {
      if (disposed) {
        player.destroy();
        return;
      }
      created = player;
      playerRef.current = player;
      setReady(true);
    });

    return () => {
      disposed = true;
      created?.destroy();
      playerRef.current = null;
      loadedQueueIdRef.current = null;
      setReady(false);
    };
  }, [containerRef, enabled]);

  // Áp trạng thái phòng lên player mỗi khi state hoặc bài hiện tại đổi.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready || !joined) return;

    if (!current || !state || state.status === 'idle') {
      if (loadedQueueIdRef.current) {
        player.stop();
        loadedQueueIdRef.current = null;
      }
      return;
    }

    const expected = expectedPosition(toAnchor(state), serverNow());

    if (loadedQueueIdRef.current !== current.id) {
      loadedQueueIdRef.current = current.id;
      settleUntilRef.current = Date.now() + SETTLE_MS;
      if (state.status === 'playing') player.load(current.video_id, expected);
      else player.cue(current.video_id, expected);
      return;
    }

    if (state.status === 'playing') {
      const playerState = player.getState();
      if (playerState !== YT_STATE.PLAYING && playerState !== YT_STATE.BUFFERING) player.play();
      if (needsSeek(player.getTime(), expected)) {
        settleUntilRef.current = Date.now() + SETTLE_MS;
        player.seek(expected);
      }
    } else {
      // Tua trước rồi mới dừng: tua sau khi dừng có thể làm YouTube tự phát lại.
      if (needsSeek(player.getTime(), expected, 0.5)) player.seek(expected);
      player.pause();
    }
  }, [ready, joined, state, current]);

  // Tắt tiếng cá nhân. PHẢI khai báo sau effect tải video ở trên: effect chạy theo thứ tự khai báo, nên
  // mỗi lần đổi bài nó áp lại trạng thái sau khi video mới được tải (player có thể đặt lại âm lượng).
  // mute()/unMute() lặp lại vô hại nên gọi vô điều kiện, không dựa vào isMuted() vốn có thể trả giá trị cũ.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) return;
    player.setMuted(muted);
  }, [ready, muted, joined, current?.id, state?.version]);

  // Đang tạm dừng mà player vẫn phát (lệnh dừng bị bỏ qua lúc buffer, hoặc ai đó bấm vào video) thì dừng lại.
  useEffect(() => {
    if (!ready || !joined || state?.status !== 'paused' || !current) return undefined;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || loadedQueueIdRef.current !== current.id) return;
      if (player.getState() === YT_STATE.PLAYING) player.pause();
    }, PAUSE_GUARD_MS);

    return () => window.clearInterval(timer);
  }, [ready, joined, state?.status, current]);

  // Sửa lệch định kỳ khi đang phát: người vào muộn, mạng chậm, hoặc bị dừng ngoài ý muốn.
  useEffect(() => {
    if (!ready || !joined || state?.status !== 'playing' || !current) return undefined;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || loadedQueueIdRef.current !== current.id) return;

      const playerState = player.getState();
      if (playerState === YT_STATE.ENDED || playerState === YT_STATE.UNSTARTED) return;
      if (playerState === YT_STATE.BUFFERING || Date.now() < settleUntilRef.current) return;

      const expected = expectedPosition(toAnchor(state), serverNow());
      if (needsSeek(player.getTime(), expected)) {
        settleUntilRef.current = Date.now() + SETTLE_MS;
        player.seek(expected);
      }
      if (playerState === YT_STATE.PAUSED) player.play();
    }, DRIFT_CHECK_MS);

    return () => window.clearInterval(timer);
  }, [ready, joined, state, current]);

  // Cập nhật thanh tiến trình cho giao diện.
  useEffect(() => {
    if (!ready || !joined) return undefined;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !loadedQueueIdRef.current) return;
      setProgress({ time: player.getTime(), duration: player.getDuration() });
    }, PROGRESS_TICK_MS);

    return () => window.clearInterval(timer);
  }, [ready, joined]);

  return { ready, progress };
}
