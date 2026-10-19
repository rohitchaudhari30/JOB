import React, { useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Search,
  KanbanSquare,
  Settings as SettingsIcon,
  Rocket,
  BarChart3,
} from 'lucide-react';
import { User } from '../types';
import { getPathForTab, getGroupForTab, NAV_GROUPS, NavGroupId } from '../utils/navigation';

export type NavTab =
  | 'dashboard'
  | 'direct_apply'
  | 'profile'
  | 'connections'
  | 'discovery'
  | 'matches'
  | 'live_console'
  | 'crm'
  | 'analytics'
  | 'schedules'
  | 'account';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user?: User | null;
  stats?: {
    isLiveRunning?: boolean;
    /** Real automation state; undefined/IDLE means nothing is running. */
    runStatus?: string | null;
  };
  /** Mobile/tablet drawer state (<1024px). Ignored on desktop. */
  open?: boolean;
  onClose?: () => void;
}

const GROUP_ICONS: Record<NavGroupId, React.ReactNode> = {
  home: <LayoutDashboard className="w-4 h-4" />,
  jobs: <Search className="w-4 h-4" />,
  applications: <KanbanSquare className="w-4 h-4" />,
  automation: <Rocket className="w-4 h-4" />,
  insights: <BarChart3 className="w-4 h-4" />,
  settings: <SettingsIcon className="w-4 h-4" />,
};

const RUN_LABELS: Record<string, { label: string; dot: string; pulse: boolean }> = {
  RUNNING: { label: 'Run in progress', dot: 'bg-emerald-500', pulse: true },
  PAUSED: { label: 'Run paused', dot: 'bg-amber-500', pulse: false },
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, user, stats, open = false, onClose }) => {
  const runState = (stats?.runStatus && RUN_LABELS[stats.runStatus]) || (stats?.isLiveRunning ? RUN_LABELS.RUNNING : null);
  const activeGroup = getGroupForTab(activeTab);
  const asideRef = useRef<HTMLElement>(null);

  // Drawer behaviour (<1024px): Esc closes, focus moves into the nav and returns to the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    asideRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
    {open && (
      <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" aria-hidden="true" onClick={onClose} />
    )}
    <aside
      ref={asideRef}
      id="primary-navigation"
      aria-label="Primary"
      className={`${open ? 'fixed inset-y-0 left-0 z-40 flex overflow-y-auto' : 'hidden'} lg:static lg:z-auto lg:flex w-64 border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 flex flex-col justify-between select-none transition-colors duration-200 shrink-0`}>
      <nav aria-label="Primary navigation" className="space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const isActive = activeGroup.id === group.id;
          const isLive = group.id === 'automation' && stats?.isLiveRunning;
          return (
            <a
              key={group.id}
              href={getPathForTab(group.entry)}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onTabChange(group.entry);
                onClose?.();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-150 cursor-pointer border ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold border-indigo-200/80 dark:border-indigo-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <span className={`shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {GROUP_ICONS[group.id]}
                </span>
                <span className="truncate whitespace-nowrap">{group.label}</span>
              </div>
              {isLive && (
                <span className="flex h-2 w-2 relative shrink-0 ml-2" role="img" aria-label="Run in progress">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Linear-Style Bottom User & Engine Footer */}
      <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-800">
        <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {user?.full_name || 'Candidate Account'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center space-x-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${runState ? runState.dot : 'bg-slate-400'} ${runState?.pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                  aria-hidden="true"
                ></span>
                <span>{runState ? runState.label : 'No active run'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
};
