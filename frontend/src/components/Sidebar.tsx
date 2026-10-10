import React from 'react';
import {
  LayoutDashboard,
  Search,
  Sparkles,
  Tv,
  KanbanSquare,
  UserCheck,
  Globe,
  Rocket,
  BarChart3,
} from 'lucide-react';
import { User } from '../types';
import { getPathForTab } from '../utils/navigation';

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
  | 'schedules';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user?: User | null;
  stats?: {
    totalMatches?: number;
    activeApplications?: number;
    isLiveRunning?: boolean;
  };
}

interface NavSection {
  title?: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
    isLive?: boolean;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, user, stats }) => {
  const sections: NavSection[] = [
    {
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
      ],
    },
    {
      title: 'AUTOMATION',
      items: [
        {
          id: 'direct_apply',
          label: 'Auto-Apply',
          icon: <Rocket className="w-4 h-4" />,
        },
        {
          id: 'live_console',
          label: 'Live Console',
          icon: <Tv className="w-4 h-4" />,
          isLive: stats?.isLiveRunning,
        },
      ],
    },
    {
      title: 'PIPELINE',
      items: [
        {
          id: 'discovery',
          label: 'Job Discovery',
          icon: <Search className="w-4 h-4" />,
        },
        {
          id: 'matches',
          label: 'AI Matches',
          icon: <Sparkles className="w-4 h-4" />,
          badge: stats?.totalMatches,
        },
        {
          id: 'crm',
          label: 'Applications',
          icon: <KanbanSquare className="w-4 h-4" />,
          badge: stats?.activeApplications,
        },
        {
          id: 'analytics',
          label: 'Analytics',
          icon: <BarChart3 className="w-4 h-4" />,
        },
      ],
    },
    {
      title: 'SETTINGS',
      items: [
        {
          id: 'profile',
          label: 'Candidate Profile',
          icon: <UserCheck className="w-4 h-4" />,
        },
        {
          id: 'connections',
          label: 'Platform Connections',
          icon: <Globe className="w-4 h-4" />,
        },
      ],
    },
  ];

  return (
    <aside className="w-68 border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 flex flex-col justify-between select-none transition-colors duration-200 shrink-0">
      <div className="space-y-5">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.title && (
              <div className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                {section.title}
              </div>
            )}

            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeTab === item.id || (item.id === 'direct_apply' && activeTab === 'schedules');
                const targetPath = getPathForTab(item.id);
                return (
                  <a
                    key={item.id}
                    href={targetPath}
                    role="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onTabChange(item.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer border ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-bold border-indigo-200/80 dark:border-indigo-800 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className={`shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-400'}`}>
                        {item.icon}
                      </span>
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      {item.isLive && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                      )}

                      {item.badge !== undefined && !item.isLive && Number(item.badge) > 0 && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-indigo-200/80 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </a>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Autopilot Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
