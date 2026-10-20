import React from 'react';
import { Clock, Sliders, Activity } from 'lucide-react';

export type CampaignSection = 'rules' | 'safety' | 'logs';

export const SECTION_IDS: Record<CampaignSection, string> = {
  rules: 'campaign-rules',
  safety: 'campaign-safety',
  logs: 'campaign-activity',
};

/** Scrolls a campaign section into view (and moves focus there for keyboard and screen-reader users). */
export function jumpToCampaignSection(section: CampaignSection) {
  const el = document.getElementById(SECTION_IDS[section]);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

interface Props {
  logCount: number;
}

const ITEMS: { id: CampaignSection; label: string; icon: React.ElementType }[] = [
  { id: 'rules', label: 'What to apply to', icon: Sliders },
  { id: 'safety', label: 'When & how fast', icon: Clock },
  { id: 'logs', label: 'Activity', icon: Activity },
];

/**
 * "On this page" links to the three campaign sections. These are shortcuts, not tabs: every
 * section is always on the page, so nothing is hidden behind a click.
 */
export const CampaignJumpBar: React.FC<Props> = ({ logCount }) => (
  <nav aria-label="On this page" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
    <span className="text-slate-500 dark:text-slate-400">Jump to:</span>
    {ITEMS.map(({ id, label, icon: Icon }) => (
      <a
        key={id}
        href={`#${SECTION_IDS[id]}`}
        onClick={(e) => {
          e.preventDefault();
          jumpToCampaignSection(id);
        }}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {id === 'logs' && <span className="text-slate-500 dark:text-slate-400">({logCount})</span>}
      </a>
    ))}
  </nav>
);
