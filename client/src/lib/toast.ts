/**
 * Tiny event-based toast. Decoupled from React (matches the app's other
 * event-driven globals like `flow:open-docs`): anywhere can call `toast(...)`;
 * the <Toaster> component listens for the event and renders/auto-dismisses.
 */

export type ToastType = 'error' | 'info' | 'success';

export interface ToastDetail {
  message: string;
  type: ToastType;
  /** Optional action link (e.g. a sign-in URL). */
  href?: string;
  hrefLabel?: string;
}

export function toast(message: string, type: ToastType = 'info', extra?: { href?: string; hrefLabel?: string }): void {
  window.dispatchEvent(
    new CustomEvent<ToastDetail>('flow:toast', { detail: { message, type, ...extra } })
  );
}
