import { Check, Link2 } from 'lucide-react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { buildRoomUrl } from '../../lib/roomApi';
import { Dialog } from '../ui/Dialog';
import { QrCode } from './QrCode';

type Props = { code: string; roomName: string; onClose: () => void };

export function InviteDialog({ code, roomName, onClose }: Props) {
  const { copied, copy } = useCopyToClipboard();
  const url = buildRoomUrl(code);

  return (
    <Dialog
      title="Mời bạn bè"
      subtitle={`Quét mã hoặc nhập mã phòng để vào “${roomName}”.`}
      onClose={onClose}
      actions={
        <button className="btn btn-primary btn-block" type="button" onClick={() => void copy(url)}>
          {copied ? <Check size={17} /> : <Link2 size={17} />} {copied ? 'Đã chép link' : 'Chép link mời'}
        </button>
      }
    >
      <div className="invite-body">
        <QrCode value={url} size={220} label={`Mã QR vào phòng ${code}`} />
        <p className="invite-code">
          Mã phòng <b>{code}</b>
        </p>
        <p className="invite-url">{url}</p>
      </div>
    </Dialog>
  );
}
