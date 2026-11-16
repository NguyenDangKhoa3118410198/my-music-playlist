import { Music2, Trash2 } from 'lucide-react';
import { getVideoThumbnail } from '../../lib/youtube';
import type { RoomMember, RoomQueueItem } from '../../types';
import { Equalizer } from './Equalizer';

type Props = {
  items: RoomQueueItem[];
  currentId: string | null;
  playing: boolean;
  members: RoomMember[];
  userId: string;
  canControl: boolean;
  onRemove: (item: RoomQueueItem) => void;
};

export function QueuePanel({ items, currentId, playing, members, userId, canControl, onRemove }: Props) {
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
          </li>
        );
      })}
    </ul>
  );
}
