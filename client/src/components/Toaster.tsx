/**
 * Toaster — listens for `flow:toast` events and renders a stack of
 * auto-dismissing toasts (portaled to body, bottom-right).
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ToastDetail } from '../lib/toast';

interface ToastItem extends ToastDetail {
  id: number;
}

let nextId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, ...detail }]);
      setTimeout(() => remove(id), 6000);
    };
    window.addEventListener('flow:toast', onToast);
    return () => window.removeEventListener('flow:toast', onToast);
  }, [remove]);

  if (!toasts.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-xl backdrop-blur ${
            t.type === 'error'
              ? 'border-red-500/40 bg-red-950/90 text-red-200'
              : t.type === 'success'
                ? 'border-green-500/40 bg-green-950/90 text-green-200'
                : 'border-neutral-700 bg-neutral-900/95 text-neutral-200'
          }`}
        >
          <div className="flex-1">
            <span>{t.message}</span>
            {t.href && (
              <a
                href={t.href}
                className="ml-1.5 font-medium underline underline-offset-2 hover:opacity-80"
              >
                {t.hrefLabel ?? 'Sign in'}
              </a>
            )}
          </div>
          <button onClick={() => remove(t.id)} className="text-current/60 hover:text-current">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
