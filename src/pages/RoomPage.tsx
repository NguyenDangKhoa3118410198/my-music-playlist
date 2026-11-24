import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, DoorClosed, DoorOpen, Headphones, History, Link2, ListMusic, ListPlus, MoreHorizontal, Music2, Pause, Play, QrCode as QrIcon, SkipForward, Tv, Users, VolumeX, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddLinkBar, type NewVideo } from '../components/room/AddLinkBar';
import { Spinner } from '../components/ui/Spinner';
import { useConfirm } from '../hooks/useConfirm';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { AvatarStack } from '../components/room/Avatar';
import { HistoryPanel } from '../components/room/HistoryPanel';
import { ImportPlaylistDialog } from '../components/room/ImportPlaylistDialog';
import { InviteDialog } from '../components/room/InviteDialog';
import { MembersPanel } from '../components/room/MembersPanel';
import { Menu } from '../components/ui/Menu';
import { QueuePanel } from '../components/room/QueuePanel';
import { ReactionBar, ReactionLayer } from '../components/room/Reactions';
import { RoomProgress } from '../components/room/RoomProgress';
import { RoomClosedScreen, RoomSkeleton } from '../components/room/RoomScreens';
import { TvPanel } from '../components/room/TvPanel';
import { useLocalMute } from '../hooks/room/useLocalMute';
import { useRoomControls } from '../hooks/room/useRoomControls';
import { useRoomHeartbeat } from '../hooks/room/useRoomHeartbeat';
import { useToast } from '../hooks/room/useToast';
import { useTvMode } from '../hooks/room/useTvMode';
import { useSyncedPlayer } from '../hooks/useSyncedPlayer';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { syncServerClock } from '../lib/clock';
import {
  addManyToQueue,
  addToQueue,
  buildRoomUrl,
  closeRoom,
  describeAddMany,
  errorMessage,
  getRoomByCode,
  leaveRoom,
} from '../lib/roomApi';
import { addedByLabel, membersById } from '../lib/roomPeople';
import { getVideoThumbnail } from '../lib/youtube';
import type { Room, RoomQueueItem } from '../types';

export function RoomPage({ userId, isAnonymous = false }: { userId: string; isAnonymous?: boolean }) {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState<'queue' | 'history' | 'members'>('queue');
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tv, setTv] = useTvMode();
  const [message, setMessage] = useToast();
  const { copied, copy } = useCopyToClipboard();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { muted, setMuted, toggleMute } = useLocalMute();

  const { state, queue, history, historyCount, members, onlineIds, connected, closed, applyState, refreshState, mutateQueue, reactions, sendReaction } = useRoomRealtime(
    room?.id ?? null,
    userId,
    { historyOpen: tab === 'history' },
  );

  const current = queue.find((item) => item.id === state?.current_queue_id) ?? null;
  const myRole = members.find((member) => member.user_id === userId)?.role;
  const isHost = myRole === 'host';
  const canControl = Boolean(room) && (isHost || myRole === 'dj' || room?.control_mode === 'everyone');
  const roomClosed = Boolean(room?.closed_at) || closed;

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
  }, [code, navigate, setMessage]);

  useRoomHeartbeat(room?.id ?? null, roomClosed, applyState);

  const controls = useRoomControls({ room, state, queue, applyState, refreshState, mutateQueue, notify: setMessage });

  const { ready, progress } = useSyncedPlayer({
    containerRef,
    enabled: Boolean(room),
    state,
    current,
    joined,
    muted,
    onEnded: controls.onEnded,
    onError: controls.onError,
  });

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
    const ok = await confirm({ title: 'Rời phòng', message: warning, confirmLabel: 'Rời phòng', danger: isHost });
    if (!ok) return;
    try {
      await leaveRoom(room.id);
      navigate('/');
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function handleCloseRoom() {
    if (!room) return;
    const ok = await confirm({
      title: 'Đóng phòng',
      message: 'Đóng phòng cho tất cả mọi người? Không ai vào lại được nữa.',
      confirmLabel: 'Đóng phòng',
      danger: true,
    });
    if (!ok) return;
    try {
      await closeRoom(room.id);
      navigate('/');
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function handleCopyLink() {
    if (!room) return;
    const link = buildRoomUrl(room.code);
    if (!(await copy(link))) setMessage(`Link phòng: ${link}`);
  }

  if (!room) return <RoomSkeleton message={message} />;
  if (roomClosed) return <RoomClosedScreen name={room.name} onHome={() => navigate('/')} />;

  const isPlaying = state?.status === 'playing';
  const thumb = getVideoThumbnail(current?.video_id);
  const onlinePeople = members
    .filter((member) => onlineIds.has(member.user_id))
    .map((member) => ({ id: member.user_id, name: member.display_name }));
  const addedByName = current ? addedByLabel(current.added_by, userId, membersById(members)) : '';
  const statusText = !current
    ? 'Đang chờ bài đầu tiên'
    : state?.status === 'paused'
      ? `Tạm dừng · ${addedByName} thêm`
      : `Đang phát · ${addedByName} thêm`;

  return (
    <main className={tv ? 'room-shell is-tv' : 'room-shell'}>
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
            { label: 'Mã QR mời bạn bè', icon: <QrIcon size={18} />, onClick: () => setInviteOpen(true) },
            { label: 'Chế độ màn hình lớn', icon: <Tv size={18} />, onClick: () => setTv(true) },
            { label: 'Rời phòng', icon: <DoorOpen size={18} />, onClick: () => void handleLeave() },
            { label: 'Đóng phòng cho mọi người', icon: <DoorClosed size={18} />, onClick: () => void handleCloseRoom(), danger: true, hidden: !isHost },
          ]}
        />
      </header>

      {tv && (
        <button className="btn btn-quiet room-tv-exit" type="button" onClick={() => setTv(false)}>
          <X size={17} /> Thoát màn hình lớn
        </button>
      )}

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
                  canControl ? controls.togglePlay() : setMessage('Chỉ chủ phòng và DJ điều khiển được phòng này.')
                }
              />
            )}
            {joined && <ReactionLayer reactions={reactions} />}
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

            <RoomProgress
              progress={progress}
              disabled={!canControl || !current}
              onSeek={controls.seek}
              muted={muted}
              onToggleMute={toggleMute}
            />

            {canControl ? (
              <div className="room-controls">
                <button
                  className="icon-btn icon-btn-xl is-primary"
                  type="button"
                  onClick={controls.togglePlay}
                  disabled={!state || (!current && queue.length === 0)}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                  {isPlaying ? <Pause size={26} /> : <Play size={26} />}
                </button>
                <button className="icon-btn" type="button" onClick={controls.skip} disabled={!current} aria-label="Bài tiếp theo">
                  <SkipForward size={20} />
                </button>
              </div>
            ) : (
              <p className="room-listening">
                <Headphones size={16} /> Bạn đang nghe cùng mọi người
              </p>
            )}
            {joined && <ReactionBar onSend={sendReaction} disabled={!connected} />}
          </div>
        </section>

        <section className="room-side">
          {tv ? (
            <TvPanel
              code={room.code}
              url={buildRoomUrl(room.code)}
              upcoming={queue.filter((item) => item.id !== state?.current_queue_id)}
              members={members}
              userId={userId}
            />
          ) : (
            <>
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
                    onRemove={controls.remove}
                    onReorder={controls.reorder}
                  />
                ) : tab === 'history' ? (
                  <HistoryPanel items={history} members={members} userId={userId} onRequeue={(item) => void handleRequeue(item)} />
                ) : (
                  <MembersPanel
                    members={members}
                    onlineIds={onlineIds}
                    userId={userId}
                    isHost={isHost}
                    onSetRole={controls.setRole}
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
            </>
          )}
        </section>
      </div>
      {confirmDialog}
      {inviteOpen && <InviteDialog code={room.code} roomName={room.name} onClose={() => setInviteOpen(false)} />}
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
