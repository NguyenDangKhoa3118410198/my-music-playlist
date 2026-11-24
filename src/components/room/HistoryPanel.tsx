import { History, Plus } from 'lucide-react';
import { addedByLabel, membersById } from '../../lib/roomPeople';
import { getVideoThumbnail } from '../../lib/youtube';
import type { RoomEndReason, RoomMember, RoomQueueItem } from '../../types';

const REASON_LABEL: Record<RoomEndReason, string> = {
  ended: 'Đã phát',
  skip: 'Bị bỏ qua',
  unplayable: 'Không phát được',
  removed: 'Đã xoá',
};

function formatClock(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  items: RoomQueueItem[];
  members: RoomMember[];
  userId: string;
  onRequeue: (item: RoomQueueItem) => void;
};

// Các bài đã phát xong hoặc bị bỏ qua, mới nhất trước. Bấm "Thêm lại" để đưa vào cuối hàng đợi.
export function HistoryPanel({ items, members, userId, onRequeue }: Props) {
  if (!items.length) {
    return (
      <div className="room-empty">
        <span className="room-empty-icon">
          <History size={26} />
        </span>
        <strong>Chưa có bài nào được phát</strong>
        <p>Bài nào phát xong sẽ nằm ở đây, để bạn nghe lại khi muốn.</p>
      </div>
    );
  }

  const nameById = membersById(members);

  return (
    <ul className="room-list" aria-label="Đã phát">
      {items.map((item) => {
        const thumb = getVideoThumbnail(item.video_id);
        const reason = item.end_reason ?? (item.status === 'skipped' ? 'skip' : 'ended');
        const failed = item.status === 'skipped';
        const who = addedByLabel(item.added_by, userId, nameById);

        return (
          <li key={item.id} className="room-item history">
            {thumb ? <img className="room-thumb" src={thumb} alt="" loading="lazy" /> : <span className="room-thumb" />}
            <div className="room-item-text">
              <strong>{item.title}</strong>
              <small className={failed ? 'is-warn' : undefined}>
                {[REASON_LABEL[reason], formatClock(item.finished_at), `${who} thêm`].filter(Boolean).join(' · ')}
              </small>
            </div>
            <button
              className="room-remove"
              type="button"
              aria-label={`Thêm lại ${item.title} vào hàng đợi`}
              title="Thêm lại vào hàng đợi"
              onClick={() => onRequeue(item)}
            >
              <Plus size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
