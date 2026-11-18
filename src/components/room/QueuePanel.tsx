import { ArrowDown, ArrowUp, ArrowUpToLine, ListOrdered, Music2, Trash2 } from 'lucide-react';
import { movePosition, type QueueMove } from '../../lib/queueOrder';
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
  onMove: (item: RoomQueueItem, move: QueueMove) => void;
};

export function QueuePanel({ items, currentId, playing, members, userId, canControl, onRemove, onMove }: Props) {
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

  const nameById = new Map(members.map((member) => [member.user_id, member.display_name]));

  return (
    <ul className="room-list" aria-label="Hàng đợi">
      {items.map((item, index) => {
        const isCurrent = item.id === currentId;
        const canRemove = canControl || item.added_by === userId;
        const thumb = getVideoThumbnail(item.video_id);
        const who = item.added_by === userId ? 'bạn' : nameById.get(item.added_by) || 'Khách';
        // Chỉ hiện thao tác nào thực sự đổi được thứ tự (bài đã ở đầu thì không có "Đưa lên").
        const canMove = (move: QueueMove) => canControl && movePosition(items, item.id, currentId, move) !== null;

        return (
          <li key={item.id} className={isCurrent ? 'room-item current' : 'room-item'}>
            <span className="room-index">{isCurrent ? <Equalizer playing={playing} /> : index + 1}</span>
            {thumb ? <img className="room-thumb" src={thumb} alt="" loading="lazy" /> : <span className="room-thumb" />}
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
                    { label: 'Phát tiếp theo', icon: <ArrowUpToLine size={18} />, onClick: () => onMove(item, 'next'), hidden: !canMove('next') },
                    { label: 'Đưa lên', icon: <ArrowUp size={18} />, onClick: () => onMove(item, 'up'), hidden: !canMove('up') },
                    { label: 'Đưa xuống', icon: <ArrowDown size={18} />, onClick: () => onMove(item, 'down'), hidden: !canMove('down') },
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
}
