import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Optional small count/badge text. */
  badge?: string | number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix that links each tab to its TabPanel. */
  idPrefix: string;
  className?: string;
}

/**
 * Accessible in-page tabs: roving tabindex, Arrow/Home/End keys, aria-selected.
 * Pair each view with <TabPanel idPrefix=… id=…>.
 * Renders as a modern segmented pill control when `className` contains `border-b-0`.
 */
export const Tabs: React.FC<TabsProps> = ({ items, value, onChange, label, idPrefix, className = '' }) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (index: number) => {
    const next = items[(index + items.length) % items.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(items.length - 1); }
  };

  const isPill = className.includes('border-b-0');

  if (isPill) {
    return (
      <div
        role="tablist"
        aria-label={label}
        className={`inline-flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs max-w-full overflow-x-auto ${className}`}
      >
        {items.map((t, i) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el; }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 whitespace-nowrap cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
                selected
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200/60 dark:border-slate-700/60'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 ${className}`}
    >
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] sm:px-4 sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600 ${
              selected
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

interface TabPanelProps {
  idPrefix: string;
  id: string;
  active: boolean;
  children: React.ReactNode;
}

/** The body for one tab. Keeps un-selected panels out of the DOM. */
export const TabPanel: React.FC<TabPanelProps> = ({ idPrefix, id, active, children }) => {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className="focus-visible:outline-none"
    >
      {children}
    </div>
  );
};
