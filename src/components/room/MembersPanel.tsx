import type { RoomMember, RoomRole } from '../../types';
import { Avatar } from './Avatar';

const ROLE_LABEL: Record<RoomRole, string> = { host: 'Chủ phòng', dj: 'DJ', listener: 'Người nghe' };

type Props = {
  members: RoomMember[];
  onlineIds: Set<string>;
  userId: string;
  isHost: boolean;
  onSetRole: (member: RoomMember, role: 'dj' | 'listener') => void;
};

export function MembersPanel({ members, onlineIds, userId, isHost, onSetRole }: Props) {
  // Người đang online xếp trước.
  const sorted = [...members].sort(
    (a, b) => Number(onlineIds.has(b.user_id)) - Number(onlineIds.has(a.user_id)),
  );

  return (
    <ul className="room-list" aria-label="Mọi người trong phòng">
      {sorted.map((member) => {
        const online = onlineIds.has(member.user_id);

        return (
          <li key={member.user_id} className="room-item member">
            <span className="member-avatar">
              <Avatar id={member.user_id} name={member.display_name} size={44} />
              <span className={online ? 'presence-dot online' : 'presence-dot'} title={online ? 'Đang online' : 'Ngoại tuyến'} />
            </span>
            <div className="room-item-text">
              <strong>
                {member.display_name}
                {member.user_id === userId ? ' (bạn)' : ''}
              </strong>
              <small>{ROLE_LABEL[member.role]}</small>
            </div>
            {isHost && member.role !== 'host' && (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => onSetRole(member, member.role === 'dj' ? 'listener' : 'dj')}
              >
                {member.role === 'dj' ? 'Bỏ DJ' : 'Làm DJ'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
