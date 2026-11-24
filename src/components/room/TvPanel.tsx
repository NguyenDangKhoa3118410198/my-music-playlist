import { addedByLabel, membersById } from '../../lib/roomPeople';
import { getVideoThumbnail } from '../../lib/youtube';
import type { RoomMember, RoomQueueItem } from '../../types';
import { QrCode } from './QrCode';

type Props = {
  code: string;
  url: string;
  upcoming: RoomQueueItem[];
  members: RoomMember[];
  userId: string;
};

const SHOWN = 5;

// Cột bên phải của chế độ màn hình lớn: mã QR để mọi người quét vào thêm bài, và các bài sắp tới.
export function TvPanel({ code, url, upcoming, members, userId }: Props) {
  const nameById = membersById(members);

  return (
    <div className="tv-panel">
      <div className="tv-join">
        <QrCode value={url} size={200} label={`Mã QR vào phòng ${code}`} />
        <div>
          <strong>Quét để vào phòng, thêm bài của bạn</strong>
          <p>
            Hoặc nhập mã <b>{code}</b>
          </p>
        </div>
      </div>

      <h2 className="tv-heading">Tiếp theo</h2>
      {upcoming.length === 0 ? (
        <p className="tv-empty">Chưa có bài tiếp theo. Quét mã để thêm bài!</p>
      ) : (
        <ol className="tv-next" aria-label="Bài tiếp theo">
          {upcoming.slice(0, SHOWN).map((item, index) => {
            const thumb = getVideoThumbnail(item.video_id);
            const who = addedByLabel(item.added_by, userId, nameById);
            return (
              <li key={item.id}>
                <span className="tv-index">{index + 1}</span>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="tv-thumb" />}
                <div>
                  <strong>{item.title}</strong>
                  <small>{who} thêm</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {upcoming.length > SHOWN && <p className="tv-more">và {upcoming.length - SHOWN} bài nữa</p>}
    </div>
  );
}
