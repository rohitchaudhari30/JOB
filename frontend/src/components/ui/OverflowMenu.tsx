import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from './IconButton';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface OverflowMenuProps {
  /** Accessible name of the trigger, e.g. "More actions for Acme job". */
  label: string;
  items: MenuAction[];
  align?: 'left' | 'right';
}

/** "More actions" menu for secondary and destructive actions. Esc closes and returns focus. */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({ label, items, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const enabled = () => Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    if (!open) return;
    enabled()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={wrap} onKeyDown={onKeyDown}>
      <IconButton
        ref={trigger}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute z-30 mt-1 min-w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { close(); it.onSelect(); }}
              className={`flex min-h-10 w-full items-center px-4 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                it.danger
                  ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                  : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
