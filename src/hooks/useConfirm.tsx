import { type ReactNode, useCallback, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmOptions } from '../components/ui/ConfirmDialog';

// `if (!(await confirm({...}))) return;` — nhớ vẽ `dialog` ở đâu đó trong component.
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(next);
    });
  }, []);

  function settle(ok: boolean) {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  }

  const dialog = options ? <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null;
  return { confirm, dialog };
}
