import { type ReactNode, useEffect, useRef, useState } from 'react';

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  hidden?: boolean;
};

type Props = {
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  buttonClassName?: string;
  up?: boolean;
};

// Menu hành động (dấu ba chấm...): đóng khi bấm ra ngoài hoặc nhấn Esc.
export function Menu({ label, icon, items, buttonClassName = 'icon-btn is-quiet', up }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className="menu" ref={rootRef}>
      <button
        className={buttonClassName}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
      </button>
      {open && (
        <div className={up ? 'menu-list is-up' : 'menu-list'} role="menu" aria-label={label}>
          {visible.map((item) =>
            item.href ? (
              <a
                key={item.label}
                className="menu-item"
                role="menuitem"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
              >
                {item.icon}
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                className={item.danger ? 'menu-item is-danger' : 'menu-item'}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
