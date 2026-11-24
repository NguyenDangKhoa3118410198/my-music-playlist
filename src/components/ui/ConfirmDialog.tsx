import { useState } from 'react';
import { Dialog } from './Dialog';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Hành động phá huỷ (xoá, đóng phòng...): nút xác nhận dùng btn-danger. */
  danger?: boolean;
};

type Props = ConfirmOptions & {
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

// Hộp xác nhận dùng chung, thay cho window.confirm. Esc/bấm nền/X đều là huỷ (do Dialog xử lý).
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn btn-quiet" type="button" onClick={onCancel} disabled={busy}>
            Huỷ
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            type="button"
            autoFocus
            disabled={busy}
            aria-busy={busy}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}
