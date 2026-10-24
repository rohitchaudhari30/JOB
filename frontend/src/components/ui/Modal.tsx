import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, innermost last. Only the innermost one reacts to the keyboard (a dialog opened from a drawer). */
const openStack: symbol[] = [];

let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;

const lockScroll = () => {
  if (openStack.length === 1) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
  }
};

const unlockScroll = () => {
  if (openStack.length === 0) {
    document.body.style.overflow = originalOverflow ?? '';
    document.body.style.paddingRight = originalPaddingRight ?? '';
    originalOverflow = null;
    originalPaddingRight = null;
  }
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  /** "center" dialog (default) or "right" side drawer. */
  variant?: 'center' | 'right';
  /** Tailwind max-width class for the panel, e.g. "max-w-lg". */
  widthClass?: string;
  /** Disable Esc/backdrop dismissal while a request is in flight. */
  dismissible?: boolean;
}

/**
 * Accessible modal: role="dialog", labelled by its title, Esc to close, focus
 * moves in on open, Tab/Shift+Tab are trapped, focus returns to the trigger.
 * `variant="right"` renders the same behaviour as a side drawer.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  headerActions,
  variant = 'center',
  widthClass = 'max-w-lg',
  dismissible = true,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first || panel)?.focus();

    const me = Symbol('modal');
    openStack.push(me);
    lockScroll();
    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== me) return;
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openStack.indexOf(me);
      if (at >= 0) openStack.splice(at, 1);
      unlockScroll();
      returnFocusTo.current?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  const isDrawer = variant === 'right';
  return createPortal(
    <div className={`fixed inset-0 z-50 flex overscroll-contain ${isDrawer ? 'justify-end' : 'items-center justify-center p-4'}`}>
      <div
        className="absolute inset-0 bg-slate-900/50 overscroll-contain"
        aria-hidden="true"
        onClick={() => dismissible && onClose()}
        data-testid="modal-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${widthClass} bg-surface text-content border border-line shadow-xl outline-none flex flex-col overscroll-contain ${
          isDrawer ? 'h-full rounded-none sm:rounded-l-2xl' : 'rounded-xl max-h-[90vh]'
        } bg-white dark:bg-slate-900`}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white truncate">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close dialog"
              className="p-1.5 -mr-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>
        <div className="px-6 py-5 overflow-y-auto overscroll-contain flex-1 text-sm flex flex-col">{children}</div>
        {footer && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export const Drawer: React.FC<Omit<ModalProps, 'variant'>> = (props) => (
  <Modal {...props} variant="right" widthClass={props.widthClass || 'max-w-xl'} />
);
