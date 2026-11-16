import { type FormEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

type Props = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  /** Có onSubmit thì phần thân và nút bấm nằm trong một <form>. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

// Hộp thoại dùng chung: Esc/bấm nền để đóng, khoá cuộn trang, trả lại tiêu điểm khi đóng.
// Trên điện thoại hiển thị dạng bottom sheet (xem components.css).
export function Dialog({ title, subtitle, onClose, children, actions, wide, onSubmit }: Props) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Lấy lúc render đầu (trước commit): sau commit, autoFocus của ô nhập trong hộp thoại đã cướp tiêu điểm.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  if (previouslyFocusedRef.current === null && typeof document !== 'undefined') {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const previouslyFocused = previouslyFocusedRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const content = (
    <>
      <div className="dialog-body">{children}</div>
      {actions && <div className="dialog-actions">{actions}</div>}
    </>
  );

  // Vẽ thẳng ra <body>: nếu nằm trong phần tử có stacking context (thanh trên sticky...), z-index của
  // hộp thoại chỉ có tác dụng trong đó và thanh phát/thanh tab sẽ đè lên.
  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={wide ? 'dialog dialog-wide' : 'dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn icon-btn-sm is-quiet" type="button" aria-label="Đóng" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {onSubmit ? (
          <form className="dialog-form" onSubmit={onSubmit}>
            {content}
          </form>
        ) : (
          content
        )}
      </section>
    </div>,
    document.body,
  );
}
