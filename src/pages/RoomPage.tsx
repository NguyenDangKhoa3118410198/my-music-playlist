import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Headphones, Link2, ListMusic, Music2, Pause, Play, SkipForward, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddLinkBar, type NewVideo } from '../components/room/AddLinkBar';
import { Spinner } from '../components/ui/Spinner';
import { AvatarStack } from '../components/room/Avatar';
import { MembersPanel } from '../components/room/MembersPanel';
import { QueuePanel } from '../components/room/QueuePanel';
import { toAnchor, useSyncedPlayer } from '../hooks/useSyncedPlayer';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { serverNow, syncServerClock } from '../lib/clock';
import {
  addToQueue,
  buildRoomUrl,
  errorMessage,
  getRoomByCode,
  isVersionConflict,
  nextInRoom,
  pauseRoom,
  playRoom,
  removeFromQueue,
  seekRoom,
  setMemberRole,
} from '../lib/roomApi';
import { expectedPosition } from '../lib/syncMath';
import { getVideoThumbnail } from '../lib/youtube';
import { describeYoutubeError } from '../lib/youtubePlayer';
import type { Room, RoomMember, RoomQueueItem, RoomState } from '../types';

function formatTime(sec: number) {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function RoomPage({ userId }: { userId: string }) {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState<'queue' | 'members'>('queue');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [seeking, setSeeking] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const seekDeadlineRef = useRef(0);
  const keyboardCommitRef = useRef<number | undefined>(undefined);

  const { state, queue, members, onlineIds, connected, applyState, refreshState } = useRoomRealtime(
    room?.id ?? null,
    userId,
  );

  const current = queue.find((item) => item.id === state?.current_queue_id) ?? null;
  const myRole = members.find((member) => member.user_id === userId)?.role;
  const isHost = myRole === 'host';
  const canControl = Boolean(room) && (isHost || myRole === 'dj' || room?.control_mode === 'everyone');

  // Tải phòng; không phải thành viên thì chuyển sang trang vào phòng.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRoomByCode(code), syncServerClock()])
      .then(([found]) => {
        if (cancelled) return;
        if (!found || found.closed_at) navigate(`/join/${code.toUpperCase()}`, { replace: true });
        else setRoom(found);
      })
      .catch((e) => !cancelled && setMessage(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Mọi thao tác điều khiển đi qua đây: cập nhật ngay bằng kết quả trả về, xử lý xung đột phiên bản.
  const run = useCallback(
    async (action: () => Promise<RoomState | void>) => {
      try {
        const result = await action();
        if (result) applyState(result);
      } catch (e) {
        if (isVersionConflict(e)) {
          await refreshState();
          setMessage('Trạng thái phòng vừa thay đổi, đã cập nhật lại.');
        } else {
          setMessage(errorMessage(e));
        }
      }
    },
    [applyState, refreshState],
  );

  const handleEnded = useCallback(
    (queueId: string) => {
      if (room) void nextInRoom(room.id, queueId, 'ended').then(applyState).catch(() => undefined);
    },
    [room, applyState],
  );

  const handleError = useCallback(
    (queueId: string, errorCode: number) => {
      if (!room) return;
      setMessage(`${describeYoutubeError(errorCode)}, đã bỏ qua bài này.`);
      void nextInRoom(room.id, queueId, 'unplayable').then(applyState).catch(() => undefined);
    },
    [room, applyState],
  );

  const { ready, progress } = useSyncedPlayer({
    containerRef,
    enabled: Boolean(room),
    state,
    current,
    joined,
    onEnded: handleEnded,
    onError: handleError,
  });

  // Thả vị trí tạm khi player đã tới nơi, hoặc quá hạn.
  useEffect(() => {
    if (seeking === null || draggingRef.current) return;
    if (Math.abs(progress.time - seeking) < 1.5 || Date.now() > seekDeadlineRef.current) setSeeking(null);
  }, [seeking, progress]);

  function currentPosition() {
    return state ? expectedPosition(toAnchor(state), serverNow()) : 0;
  }

  function handleTogglePlay() {
    if (!room || !state) return;
    void run(() =>
      state.status === 'playing'
        ? pauseRoom(room.id, currentPosition(), state.version)
        : playRoom(room.id, currentPosition(), state.version),
    );
  }

  function handleSkip() {
    if (!room || !state?.current_queue_id) return;
    const queueId = state.current_queue_id;
    void run(() => nextInRoom(room.id, queueId, 'skip'));
  }

  // Gửi lệnh tua đúng một lần cho mỗi lần kéo/bấm. Giữ vị trí đã chọn trên thanh tua cho tới khi
  // player bắt kịp (hoặc quá hạn), để thanh không giật ngược về vị trí cũ.
  function commitSeek(position: number) {
    seekDeadlineRef.current = Date.now() + 3000;
    setSeeking(position);
    if (!room || !state) return;
    void run(() => seekRoom(room.id, position, state.version));
  }

  function handleSeekChange(value: number) {
    setSeeking(value);
    // Bàn phím không có "nhả chuột": gom các lần đổi liên tiếp rồi gửi một lần.
    if (!draggingRef.current) {
      window.clearTimeout(keyboardCommitRef.current);
      keyboardCommitRef.current = window.setTimeout(() => commitSeek(value), 500);
    }
  }

  function handleSeekEnd(value: number) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    commitSeek(value);
  }

  async function handleAdd(video: NewVideo) {
    if (!room) return;
    await addToQueue(room.id, video);
  }

  function handleRemove(item: RoomQueueItem) {
    if (room) void run(() => removeFromQueue(room.id, item.id));
  }

  function handleSetRole(member: RoomMember, role: 'dj' | 'listener') {
    if (room) void run(() => setMemberRole(room.id, member.user_id, role));
  }

  async function handleCopyLink() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(buildRoomUrl(room.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage(`Link phòng: ${buildRoomUrl(room.code)}`);
    }
  }

  if (!room) {
    return (
      <main className="room-shell">
        <div className="room-skeleton" aria-busy="true" aria-label="Đang mở phòng">
          <span className="sk sk-title" />
          <span className="sk sk-video" />
          <span className="sk sk-line" />
          {message && <p className="form-message">{message}</p>}
        </div>
      </main>
    );
  }

  const isPlaying = state?.status === 'playing';
  const shownTime = seeking ?? progress.time;
  const duration = Math.max(progress.duration, 1);
  const fill = Math.min(100, (Math.min(shownTime, duration) / duration) * 100);
  const thumb = getVideoThumbnail(current?.video_id);
  const onlinePeople = members
    .filter((member) => onlineIds.has(member.user_id))
    .map((member) => ({ id: member.user_id, name: member.display_name }));
  const addedByName = current
    ? current.added_by === userId
      ? 'bạn'
      : members.find((member) => member.user_id === current.added_by)?.display_name || 'Khách'
    : '';
  const statusText = !current
    ? 'Đang chờ bài đầu tiên'
    : state?.status === 'paused'
      ? `Tạm dừng · ${addedByName} thêm`
      : `Đang phát · ${addedByName} thêm`;

  return (
    <main className="room-shell">
      <div
        className="room-ambient"
        aria-hidden="true"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      />

      <header className="room-header">
        <button className="icon-btn" type="button" onClick={() => navigate('/')} aria-label="Về trang chủ">
          <ArrowLeft size={20} />
        </button>
        <div className="room-title">
          <h1>{room.name}</h1>
          <div className="room-meta">
            <span className={isPlaying ? 'live-pill on' : 'live-pill'}>
              <i /> {isPlaying ? 'Đang phát' : 'Phòng nghe chung'}
            </span>
            <span>
              Mã <b>{room.code}</b>
            </span>
          </div>
        </div>
        <AvatarStack people={onlinePeople} />
        <button className="btn btn-primary" type="button" onClick={() => void handleCopyLink()}>
          {copied ? <Check size={17} /> : <Link2 size={17} />}
          <span>{copied ? 'Đã chép' : 'Mời bạn'}</span>
        </button>
      </header>

      {!connected && (
        <div className="room-banner" role="status">
          <Spinner size={14} /> Đang kết nối lại
        </div>
      )}
      {message && (
        <div className="room-toast" role="status">
          {message}
        </div>
      )}

      <div className="room-layout">
        <section className="room-stage">
          <div className="room-video">
            <div ref={containerRef} className="room-video-mount" />
            {joined && current && (
              <button
                type="button"
                className={canControl ? 'room-video-shield' : 'room-video-shield locked'}
                aria-label={isPlaying ? 'Bấm vào video để tạm dừng' : 'Bấm vào video để phát'}
                onClick={() =>
                  canControl ? handleTogglePlay() : setMessage('Chỉ chủ phòng và DJ điều khiển được phòng này.')
                }
              />
            )}
            {joined && !current && (
              <div className="room-video-overlay">
                <span className="room-empty-icon">
                  <Music2 size={28} />
                </span>
                <strong>Chưa có bài nào</strong>
                <p>Dán link YouTube ở ô bên dưới để bắt đầu.</p>
              </div>
            )}
            {!joined && (
              <div className="room-gate" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                <div className="room-gate-inner">
                  <p className="room-gate-eyebrow">
                    {onlineIds.size > 1 ? `${onlineIds.size} người đang nghe` : 'Phòng đang chờ bạn'}
                  </p>
                  <strong>{current?.title ?? room.name}</strong>
                  <button className="play-cta" type="button" disabled={!ready} onClick={() => setJoined(true)}>
                    {ready ? <Play size={20} /> : <Spinner size={20} />} Tham gia nghe
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="room-now">
            <div className="room-now-text">
              <strong>{current?.title ?? 'Chưa phát bài nào'}</strong>
              <small>{statusText}</small>
            </div>

            <div className="room-progress">
              <span>{formatTime(shownTime)}</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={1}
                value={Math.min(shownTime, duration)}
                style={{ '--fill': `${fill}%` } as React.CSSProperties}
                disabled={!canControl || !current}
                onPointerDown={() => {
                  draggingRef.current = true;
                }}
                onChange={(event) => handleSeekChange(Number(event.target.value))}
                onPointerUp={(event) => handleSeekEnd(Number(event.currentTarget.value))}
                onPointerCancel={() => {
                  draggingRef.current = false;
                  setSeeking(null);
                }}
                aria-label="Tua bài hát"
              />
              <span>{formatTime(progress.duration)}</span>
            </div>

            {canControl ? (
              <div className="room-controls">
                <button
                  className="icon-btn icon-btn-xl is-primary"
                  type="button"
                  onClick={handleTogglePlay}
                  disabled={!state || (!current && queue.length === 0)}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                  {isPlaying ? <Pause size={26} /> : <Play size={26} />}
                </button>
                <button className="icon-btn" type="button" onClick={handleSkip} disabled={!current} aria-label="Bài tiếp theo">
                  <SkipForward size={20} />
                </button>
              </div>
            ) : (
              <p className="room-listening">
                <Headphones size={16} /> Bạn đang nghe cùng mọi người
              </p>
            )}
          </div>
        </section>

        <section className="room-side">
          <div className="room-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'active' : ''} type="button" onClick={() => setTab('queue')}>
              <ListMusic size={16} /> Hàng đợi ({queue.length})
            </button>
            <button role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'active' : ''} type="button" onClick={() => setTab('members')}>
              <Users size={16} /> Mọi người ({members.length})
            </button>
          </div>

          <div className="room-panel">
            {tab === 'queue' ? (
              <QueuePanel
                items={queue}
                currentId={state?.current_queue_id ?? null}
                playing={isPlaying}
                members={members}
                userId={userId}
                canControl={canControl}
                onRemove={handleRemove}
              />
            ) : (
              <MembersPanel
                members={members}
                onlineIds={onlineIds}
                userId={userId}
                isHost={isHost}
                onSetRole={handleSetRole}
              />
            )}
          </div>

          <AddLinkBar onAdd={handleAdd} />
        </section>
      </div>
    </main>
  );
}
