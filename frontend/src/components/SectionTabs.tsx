import React from 'react';
import type { NavTab } from './Sidebar';
import { getGroupForTab, getPathForTab } from '../utils/navigation';

interface SectionTabsProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

/**
 * Sub-navigation inside a primary section (e.g. Settings › Profile | Resumes & answers ...).
 * Rendered as real links with aria-current so each view has its own URL and keyboard support.
 */
export const SectionTabs: React.FC<SectionTabsProps> = ({ activeTab, onTabChange }) => {
  const group = getGroupForTab(activeTab);
  if (!group.sections || group.sections.length < 2) return null;

  // The safety/schedule deep link belongs to the Campaigns view.
  const current: NavTab = activeTab === 'schedules' ? 'direct_apply' : activeTab;

  return (
    <nav aria-label={`${group.label} sections`} className="mb-5">
      <div className="inline-flex p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs max-w-full overflow-x-auto">
        <ul className="flex items-center gap-1">
          {group.sections.map((s) => {
            const isActive = s.tab === current;
            return (
              <li key={s.tab} className="shrink-0">
                <a
                  href={getPathForTab(s.tab)}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onTabChange(s.tab);
                  }}
                  className={`inline-flex items-center whitespace-nowrap px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-slate-200/60 dark:border-slate-700/60'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};
