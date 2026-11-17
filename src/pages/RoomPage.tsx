import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, DoorClosed, DoorOpen, Headphones, History, Link2, ListMusic, ListPlus, MoreHorizontal, Music2, Pause, Play, SkipForward, Users, Volume2, VolumeX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddLinkBar, type NewVideo } from '../components/room/AddLinkBar';
import { Spinner } from '../components/ui/Spinner';
import { AvatarStack } from '../components/room/Avatar';
import { HistoryPanel } from '../components/room/HistoryPanel';
import { ImportPlaylistDialog } from '../components/room/ImportPlaylistDialog';
import { MembersPanel } from '../components/room/MembersPanel';
import { Menu } from '../components/ui/Menu';
import { QueuePanel } from '../components/room/QueuePanel';
import { toAnchor, useSyncedPlayer } from '../hooks/useSyncedPlayer';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { serverNow, syncServerClock } from '../lib/clock';
import {
  addManyToQueue,
  addToQueue,
  buildRoomUrl,
  closeRoom,
  describeAddMany,
  errorMessage,
  getRoomByCode,
  isVersionConflict,
  leaveRoom,
  nextInRoom,
  pauseRoom,
  pingRoom,
  playRoom,
  removeFromQueue,
  seekRoom,
  settleRoom,
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

// Nhịp tim: cho server biết còn người nghe. Thưa hơn ngưỡng 120 giây của server để một lần mất gói không bị coi là bỏ đi.
const HEARTBEAT_MS = 45_000;

export function RoomPage({ userId, isAnonymous = false }: { userId: string; isAnonymous?: boolean }) {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState<'queue' | 'history' | 'members'>('queue');
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  // Tắt tiếng chỉ cho riêng máy này, tạm thời: không lưu lại, tải lại trang là bật tiếng như mặc định.
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const seekDeadlineRef = useRef(0);
  const keyboardCommitRef = useRef<number | undefined>(undefined);

  const { state, queue, history, historyCount, members, onlineIds, connected, closed, applyState, refreshState } = useRoomRealtime(
    room?.id ?? null,
    userId,
    { historyOpen: tab === 'history' },
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
        if (!found) navigate(`/join/${code.toUpperCase()}`, { replace: true });
        else setRoom(found);
      })
      .catch((e) => !cancelled && setMessage(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  // Vào phòng: dọn trạng thái "đang phát" cũ nếu lâu không ai nghe (server tạm dừng lại), rồi ping định kỳ.
  // Thứ tự quan trọng: settle TRƯỚC ping, vì ping của chính mình sẽ làm phòng trông như "đang có người".
  const roomId = room?.id ?? null;
  const roomClosed = Boolean(room?.closed_at) || closed;
  useEffect(() => {
    if (!roomId || roomClosed) return undefined;

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
  }, [roomId, roomClosed, applyState]);

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
      const title = queue.find((item) => item.id === queueId)?.title;
      setMessage(`${describeYoutubeError(errorCode)}${title ? ` (“${title}”)` : ''}, đã bỏ qua bài này.`);
      void nextInRoom(room.id, queueId, 'unplayable').then(applyState).catch(() => undefined);
    },
    [room, applyState, queue],
  );

  const { ready, progress } = useSyncedPlayer({
    containerRef,
    enabled: Boolean(room),
    state,
    current,
    joined,
    muted,
    onEnded: handleEnded,
    onError: handleError,
  });

  // Phím tắt M: bật/tắt tiếng (không kích hoạt khi đang gõ vào ô nhập).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setMuted((current) => !current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
    setMessage(`Đã thêm “${video.title}” vào hàng đợi`);
  }

  async function handleRequeue(item: RoomQueueItem) {
    if (!room) return;
    try {
      await addToQueue(room.id, {
        videoId: item.video_id,
        url: item.youtube_url,
        title: item.title,
        thumbnail: getVideoThumbnail(item.video_id),
      });
      setMessage(`Đã thêm lại “${item.title}” vào hàng đợi`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function handleImport(videos: Parameters<typeof addManyToQueue>[1]) {
    if (!room) return;
    const result = await addManyToQueue(room.id, videos);
    setImportOpen(false);
    setTab('queue');
    setMessage(describeAddMany(result));
  }

  async function handleLeave() {
    if (!room) return;
    const warning = isHost
      ? 'Bạn là chủ phòng. Rời đi sẽ chuyển quyền chủ phòng cho người khác (hoặc đóng phòng nếu không còn ai). Rời phòng?'
      : 'Rời phòng này?';
    if (!window.confirm(warning)) return;
    try {
      await leaveRoom(room.id);
      navigate('/');
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function handleCloseRoom() {
    if (!room || !window.confirm('Đóng phòng cho tất cả mọi người? Không ai vào lại được nữa.')) return;
    try {
      await closeRoom(room.id);
      navigate('/');
    } catch (e) {
      setMessage(errorMessage(e));
    }
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

  if (roomClosed) {
    return (
      <main className="center-shell">
        <div className="room-ambient" aria-hidden="true" />
        <section className="center-card">
          <div className="center-icon is-warning">
            <DoorClosed size={36} />
          </div>
          <h1>Phòng đã đóng</h1>
          <p>“{room.name}” đã được chủ phòng đóng, không thể vào lại nữa. Bạn có thể tạo một phòng mới từ trang chủ.</p>
          <button className="btn btn-primary btn-lg btn-block" type="button" onClick={() => navigate('/')}>
            Về trang chủ
          </button>
        </section>
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
        <Menu
          label="Tuỳ chọn phòng"
          icon={<MoreHorizontal size={20} />}
          buttonClassName="icon-btn"
          items={[
            { label: 'Rời phòng', icon: <DoorOpen size={18} />, onClick: () => void handleLeave() },
            { label: 'Đóng phòng cho mọi người', icon: <DoorClosed size={18} />, onClick: () => void handleCloseRoom(), danger: true, hidden: !isHost },
          ]}
        />
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
            {joined && muted && (
              <button className="room-muted-chip" type="button" onClick={() => setMuted(false)}>
                <VolumeX size={16} /> Đang tắt tiếng · bấm để bật
              </button>
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
              <button
                className={muted ? 'icon-btn is-active' : 'icon-btn'}
                type="button"
                aria-pressed={muted}
                aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
                title={muted ? 'Bật tiếng (M)' : 'Tắt tiếng trên máy này (M)'}
                onClick={() => setMuted((current) => !current)}
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
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
            <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} type="button" onClick={() => setTab('history')}>
              <History size={16} /> Đã phát ({historyCount})
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
            ) : tab === 'history' ? (
              <HistoryPanel items={history} members={members} userId={userId} onRequeue={(item) => void handleRequeue(item)} />
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

          {/* Nút nằm TRONG thanh dán link: trên điện thoại thanh này cố định ở đáy nên luôn thấy được
              (đặt ngoài thanh thì nó bị thanh che cho tới khi cuộn trang). */}
          <AddLinkBar
            onAdd={handleAdd}
            extraAction={
              isAnonymous ? undefined : (
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Thêm từ playlist của bạn"
                  title="Thêm từ playlist của bạn"
                  onClick={() => setImportOpen(true)}
                >
                  <ListPlus size={20} />
                </button>
              )
            }
          />
        </section>
      </div>
      {importOpen && (
        <ImportPlaylistDialog
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          limitNote={
            myRole === 'host' || myRole === 'dj'
              ? 'Bạn là chủ phòng/DJ nên không bị giới hạn số bài chờ.'
              : `Người nghe chỉ có tối đa ${room.max_queue_per_user} bài chờ cùng lúc.`
          }
        />
      )}
    </main>
  );
}
