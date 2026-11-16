import { useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import { buildInviteUrl, createInvite } from '../../lib/inviteApi';
import type { MemberRole, PlaylistWithRole } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';

export function CreatePlaylistDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  return (
    <Dialog
      title="Tạo playlist mới"
      onClose={onClose}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!trimmed) return;
        setBusy(true);
        try {
          await onCreate(trimmed);
        } finally {
          setBusy(false);
        }
      }}
      actions={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" type="submit" disabled={!trimmed || busy}>
            {busy && <Spinner size={18} />}
            Tạo playlist
          </button>
        </>
      }
    >
      <label>
        Tên playlist
        <input autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Bài tủ cuối tuần" required />
      </label>
      <p className="form-helper">{name.length}/100</p>
    </Dialog>
  );
}

export function ShareDialog({
  playlist,
  onClose,
  onMessage,
}: {
  playlist: PlaylistWithRole;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const [role, setRole] = useState<Exclude<MemberRole, 'owner'>>('viewer');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      const link = buildInviteUrl(await createInvite(playlist.id, role));
      setUrl(link);
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      onMessage('Đã tạo link mời và sao chép vào bộ nhớ tạm.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được link mời.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Chia sẻ playlist"
      subtitle={playlist.name}
      onClose={onClose}
      actions={
        <button className="btn btn-primary btn-block" type="button" disabled={busy} onClick={() => void handleCreate()}>
          {busy ? <Spinner size={18} /> : <Link2 size={18} />} {url ? 'Tạo link mới' : 'Tạo link mời'}
        </button>
      }
    >
      <div className="segmented" role="group" aria-label="Quyền của người nhận link">
        <button className={role === 'viewer' ? 'active' : ''} type="button" aria-pressed={role === 'viewer'} onClick={() => setRole('viewer')}>
          Chỉ xem
        </button>
        <button className={role === 'editor' ? 'active' : ''} type="button" aria-pressed={role === 'editor'} onClick={() => setRole('editor')}>
          Được sửa
        </button>
      </div>
      <p className="form-helper">
        {role === 'viewer' ? 'Người nhận xem và nghe được, không sửa được.' : 'Người nhận thêm, sửa, xoá bài hát được.'} Link có hiệu lực 14 ngày.
      </p>
      {url && (
        <div className="copy-field">
          <Copy size={17} />
          <input aria-label="Link mời" value={url} readOnly onFocus={(event) => event.target.select()} />
        </div>
      )}
      {error && <p className="form-message error">{error}</p>}
    </Dialog>
  );
}
