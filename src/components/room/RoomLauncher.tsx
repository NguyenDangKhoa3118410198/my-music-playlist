import { type ReactNode, useState } from 'react';
import { Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createRoom, errorMessage, isValidRoomCode, normalizeRoomCode } from '../../lib/roomApi';
import type { RoomControlMode } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';

type Props = {
  /** Tuỳ biến nút mở hộp thoại (mục menu, tab...). Mặc định là nút chính "Phòng nghe chung". */
  renderTrigger?: (open: (mode?: 'create' | 'join') => void) => ReactNode;
};

export function RoomLauncher({ renderTrigger }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [controlMode, setControlMode] = useState<RoomControlMode>('host_only');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function openDialog(nextMode: 'create' | 'join' = 'create') {
    setMode(nextMode);
    setError('');
    setOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const room = await createRoom(name.trim(), controlMode);
      navigate(`/room/${room.code}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (isValidRoomCode(code)) navigate(`/join/${normalizeRoomCode(code)}`);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger(openDialog)
      ) : (
        <button className="btn btn-primary btn-sm" type="button" aria-label="Phòng nghe chung" onClick={() => openDialog()}>
          <Radio size={17} /> <span>Phòng nghe chung</span>
        </button>
      )}

      {open && (
        <Dialog
          title="Phòng nghe chung"
          subtitle="Nghe cùng bạn bè, ai cũng thêm bài được."
          onClose={() => setOpen(false)}
          onSubmit={mode === 'create' ? handleCreate : handleJoin}
          actions={
            mode === 'create' ? (
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || !name.trim()}>
                {busy && <Spinner size={18} />}
                Tạo phòng
              </button>
            ) : (
              <button className="btn btn-primary btn-block" type="submit" disabled={!isValidRoomCode(code)}>
                Vào phòng
              </button>
            )
          }
        >
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} type="button" onClick={() => setMode('create')}>
              Tạo phòng
            </button>
            <button role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} type="button" onClick={() => setMode('join')}>
              Vào bằng mã
            </button>
          </div>

          {mode === 'create' ? (
            <>
              <label>
                Tên phòng
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="Chill cuối tuần" autoFocus />
              </label>
              <label>
                Ai được điều khiển
                <select value={controlMode} onChange={(e) => setControlMode(e.target.value as RoomControlMode)}>
                  <option value="host_only">Chỉ chủ phòng và DJ</option>
                  <option value="everyone">Mọi người</option>
                </select>
              </label>
            </>
          ) : (
            <label>
              Mã phòng
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required placeholder="K7Q2MX" autoFocus autoCapitalize="characters" spellCheck={false} />
              <span className="form-helper">Mã gồm 6 ký tự chữ và số, ví dụ K7Q2MX.</span>
            </label>
          )}

          {error && <p className="form-message error">{error}</p>}
        </Dialog>
      )}
    </>
  );
}
