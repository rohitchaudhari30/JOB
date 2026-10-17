/**
 * Tiny registry so a page with unsaved edits can ask the shell to confirm before
 * an in-app navigation. Browser Back/Forward cannot be blocked reliably, so those
 * are covered only by the `beforeunload` prompt for tab close/reload.
 */
let message: string | null = null;

export function setUnsavedGuard(next: string | null): void {
  message = next;
}

/** True when it is fine to leave (nothing unsaved, or the user agreed to discard). */
export function confirmLeave(): boolean {
  if (!message) return true;
  if (typeof window === 'undefined') return true;
  const ok = window.confirm(message);
  if (ok) message = null;
  return ok;
}
