import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpToLine, GripVertical, ListOrdered, Music2, Trash2 } from 'lucide-react';
import { movePosition, positionAtIndex, type QueueMove } from '../../lib/queueOrder';
import { addedByLabel, membersById } from '../../lib/roomPeople';
import { getVideoThumbnail } from '../../lib/youtube';
import type { RoomMember, RoomQueueItem } from '../../types';
import { Menu } from '../ui/Menu';
import { Equalizer } from './Equalizer';

type Props = {
  items: RoomQueueItem[];
  currentId: string | null;
  playing: boolean;
  members: RoomMember[];
  userId: string;
  canControl: boolean;
  onRemove: (item: RoomQueueItem) => void;
  /** Đưa bài tới vị trí mới (giá trị `position` đã tính sẵn, xem lib/queueOrder.ts). */
  onReorder: (item: RoomQueueItem, position: number) => void;
};

// Một lần kéo: đo sẵn vị trí các dòng lúc bắt đầu (các dòng khác đứng yên suốt lúc kéo nên không cần đo lại).
type Drag = {
  id: string;
  from: number;
  over: number;
  startY: number;
  lastY: number;
  startScroll: number;
  startWindowScroll: number;
  tops: number[];
  bottoms: number[];
  scroller: HTMLElement | null;
  raf: number;
};
type DragView = { id: string; from: number; over: number; offset: number };

const EDGE_SCROLL_ZONE = 48;
const EDGE_SCROLL_MAX_STEP = 14;

// Vùng nhìn thấy của danh sách. Trên điện thoại, phần video ở trên cùng dính lại (sticky) và thanh thêm link ở đáy
// cố định (fixed), cả hai che mất một phần danh sách nên không tính vào vùng kéo.
function visibleRegion(list: HTMLElement, scroller: HTMLElement | null) {
  const panel = (scroller ?? list).getBoundingClientRect();
  let top = Math.max(panel.top, 0);
  let bottom = Math.min(panel.bottom, window.innerHeight);
  const stage = document.querySelector<HTMLElement>('.room-stage');
  if (stage && getComputedStyle(stage).position === 'sticky') top = Math.max(top, stage.getBoundingClientRect().bottom);
  const addBar = document.querySelector<HTMLElement>('.room-add');
  if (addBar && getComputedStyle(addBar).position === 'fixed') bottom = Math.min(bottom, addBar.getBoundingClientRect().top);
  return { top, bottom };
}

export function QueuePanel({ items, currentId, playing, members, userId, canControl, onRemove, onReorder }: Props) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);

  useEffect(
    () => () => {
      if (dragRef.current) cancelAnimationFrame(dragRef.current.raf);
    },
    [],
  );

  if (!items.length) {
    return (
      <div className="room-empty">
        <span className="room-empty-icon">
          <Music2 size={26} />
        </span>
        <strong>Hàng đợi đang trống</strong>
        <p>Dán link YouTube ở ô bên dưới, cả phòng sẽ nghe cùng nhau.</p>
      </div>
    );
  }

  const nameById = membersById(members);
  const currentIndex = items.findIndex((item) => item.id === currentId);

  // Tính lại dòng đang được trỏ tới và độ lệch của dòng đang kéo (sau khi con trỏ hoặc khung cuộn nhúc nhích).
  function updateDrag() {
    const current = dragRef.current;
    if (!current) return;
    const scrolled = (current.scroller?.scrollTop ?? 0) - current.startScroll + (window.scrollY - current.startWindowScroll);
    const y = current.lastY + scrolled;
    let over = current.bottoms.findIndex((bottom) => y < bottom);
    if (over === -1) over = current.bottoms.length - 1;
    over = Math.max(over, currentIndex + 1); // không kéo lên trên bài đang phát
    current.over = over;
    setDrag({ id: current.id, from: current.from, over, offset: current.lastY - current.startY + scrolled });
  }

  // Kéo sát mép vùng nhìn thấy thì tự cuộn (khung danh sách trên máy tính, cả trang trên điện thoại), càng sát càng nhanh.
  function autoScroll() {
    const current = dragRef.current;
    const list = listRef.current;
    if (!current || !list) return;

    const { scroller } = current;
    const { top, bottom } = visibleRegion(list, scroller);
    const intoTop = top + EDGE_SCROLL_ZONE - current.lastY;
    const intoBottom = current.lastY - (bottom - EDGE_SCROLL_ZONE);
    const depth = intoTop > 0 ? -Math.min(intoTop, EDGE_SCROLL_ZONE) : intoBottom > 0 ? Math.min(intoBottom, EDGE_SCROLL_ZONE) : 0;
    if (depth !== 0) {
      const step = (depth / EDGE_SCROLL_ZONE) * EDGE_SCROLL_MAX_STEP;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) scroller.scrollTop += step;
      else window.scrollBy(0, step);
      updateDrag();
    }
    current.raf = requestAnimationFrame(autoScroll);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, item: RoomQueueItem, index: number) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const rects = Array.from(list.children).map((row) => row.getBoundingClientRect());
    const scroller = list.closest<HTMLElement>('.room-panel');
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: item.id,
      from: index,
      over: index,
      startY: event.clientY,
      lastY: event.clientY,
      startScroll: scroller?.scrollTop ?? 0,
      startWindowScroll: window.scrollY,
      tops: rects.map((rect) => rect.top),
      bottoms: rects.map((rect) => rect.bottom),
      scroller,
      raf: requestAnimationFrame(autoScroll),
    };
    setDrag({ id: item.id, from: index, over: index, offset: 0 });
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current) return;
    current.lastY = event.clientY;
    updateDrag();
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, commit: boolean) {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (current) cancelAnimationFrame(current.raf);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current || !commit || current.over === current.from) return;

    const item = items.find((candidate) => candidate.id === current.id);
    const position = positionAtIndex(items, current.id, currentId, current.over);
    if (item && position !== null) onReorder(item, position);
  }

  // Bàn phím: mũi tên lên/xuống khi đang đứng ở tay cầm.
  function onGripKey(event: KeyboardEvent<HTMLButtonElement>, item: RoomQueueItem) {
    const move: QueueMove | null = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
    if (!move) return;
    event.preventDefault();
    const position = movePosition(items, item.id, currentId, move);
    if (position !== null) onReorder(item, position);
  }

  return (
    <ul className={drag ? 'room-list is-dragging' : 'room-list'} aria-label="Hàng đợi" ref={listRef}>
      {items.map((item, index) => {
        const isCurrent = item.id === currentId;
        const canRemove = canControl || item.added_by === userId;
        const thumb = getVideoThumbnail(item.video_id);
        const who = addedByLabel(item.added_by, userId, nameById);
        // Chỉ hiện thao tác nào thực sự đổi được thứ tự (bài đã ở đầu thì không có "Đưa lên").
        const canMove = (move: QueueMove) => canControl && movePosition(items, item.id, currentId, move) !== null;

        const classes = ['room-item'];
        if (isCurrent) classes.push('current');
        if (drag?.id === item.id) classes.push('is-dragging');
        if (drag && drag.over === index && drag.over !== drag.from) classes.push(drag.over < drag.from ? 'drop-above' : 'drop-below');

        return (
          <li key={item.id} className={classes.join(' ')} style={drag?.id === item.id ? { transform: `translateY(${drag.offset}px)` } : undefined}>
            {isCurrent ? (
              <span className="room-index">
                <Equalizer playing={playing} />
              </span>
            ) : canControl ? (
              <button
                className="room-grip"
                type="button"
                aria-label={`Kéo để đổi chỗ “${item.title}”`}
                title="Kéo để đổi chỗ"
                onPointerDown={(event) => startDrag(event, item, index)}
                onPointerMove={moveDrag}
                onPointerUp={(event) => endDrag(event, true)}
                onPointerCancel={(event) => endDrag(event, false)}
                onKeyDown={(event) => onGripKey(event, item)}
              >
                <GripVertical size={18} />
              </button>
            ) : (
              <span className="room-index">{index + 1}</span>
            )}
            {thumb ? <img className="room-thumb" src={thumb} alt="" loading="lazy" draggable={false} /> : <span className="room-thumb" />}
            <div className="room-item-text">
              <strong>{item.title}</strong>
              <small>
                {isCurrent ? 'Đang phát · ' : ''}
                {who} thêm
              </small>
            </div>
            <div className="room-item-actions">
              {canControl && (
                <Menu
                  label={`Sắp xếp “${item.title}”`}
                  icon={<ListOrdered size={17} />}
                  buttonClassName="icon-btn icon-btn-sm is-quiet"
                  // Hàng thứ 3 trở đi mở lên trên: mở xuống sẽ bị khung cuộn hoặc thanh thêm link ở đáy (điện thoại) che mất.
                  up={index >= 2}
                  items={[
                    { label: 'Phát tiếp theo', icon: <ArrowUpToLine size={18} />, onClick: () => reorderBy(item, 'next'), hidden: !canMove('next') },
                    { label: 'Đưa lên', icon: <ArrowUp size={18} />, onClick: () => reorderBy(item, 'up'), hidden: !canMove('up') },
                    { label: 'Đưa xuống', icon: <ArrowDown size={18} />, onClick: () => reorderBy(item, 'down'), hidden: !canMove('down') },
                  ]}
                />
              )}
              {canRemove && (
                <button
                  className="room-remove"
                  type="button"
                  aria-label={`Xoá ${item.title} khỏi hàng đợi`}
                  onClick={() => onRemove(item)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  function reorderBy(item: RoomQueueItem, move: QueueMove) {
    const position = movePosition(items, item.id, currentId, move);
    if (position !== null) onReorder(item, position);
  }
}
