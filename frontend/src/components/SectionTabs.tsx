import React from 'react';
import type { NavTab } from './Sidebar';
import { getGroupForTab, getPathForTab } from '../utils/navigation';

interface SectionTabsProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

/**
 * Sub-navigation inside a primary section (e.g. Jobs › Discover | AI matches).
 * Rendered as real links so each view has its own URL and works with the
 * keyboard; renders nothing for single-view sections.
 */
export const SectionTabs: React.FC<SectionTabsProps> = ({ activeTab, onTabChange }) => {
  const group = getGroupForTab(activeTab);
  if (!group.sections || group.sections.length < 2) return null;

  // The safety/schedule deep link belongs to the Campaigns view.
  const current: NavTab = activeTab === 'schedules' ? 'direct_apply' : activeTab;

  return (
    <nav aria-label={`${group.label} sections`} className="mb-5 border-b border-slate-200 dark:border-slate-800">
      <ul className="flex gap-1 -mb-px overflow-x-auto">
        {group.sections.map((s) => {
          const isActive = s.tab === current;
          return (
            <li key={s.tab}>
              <a
                href={getPathForTab(s.tab)}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onTabChange(s.tab);
                }}
                className={`inline-block whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
