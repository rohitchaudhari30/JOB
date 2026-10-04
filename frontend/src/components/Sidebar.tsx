import React from 'react';
import {
  LayoutDashboard,
  Search,
  Sparkles,
  Tv,
  KanbanSquare,
  UserCheck,
  Clock,
  Layers,
  Globe,
  Rocket,
} from 'lucide-react';

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
  stats?: {
    totalMatches?: number;
    activeApplications?: number;
    isLiveRunning?: boolean;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, stats }) => {
  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
    isLive?: boolean;
    isPrimary?: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'direct_apply',
      label: 'Start Apply',
      icon: <Rocket className="w-4 h-4 text-indigo-500" />,
      isPrimary: true,
    },
    {
      id: 'profile',
      label: 'Candidate Setup',
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      id: 'connections',
      label: 'Platform Connections',
      icon: <Globe className="w-4 h-4" />,
    },
    {
      id: 'discovery',
      label: 'Job Discovery',
      icon: <Search className="w-4 h-4" />,
    },
    {
      id: 'matches',
      label: 'AI Job Matches',
      icon: <Sparkles className="w-4 h-4" />,
      badge: stats?.totalMatches,
    },
    {
      id: 'live_console',
      label: 'Live Automation',
      icon: <Tv className="w-4 h-4" />,
      isLive: stats?.isLiveRunning,
    },
    {
      id: 'crm',
      label: 'Application CRM',
      icon: <KanbanSquare className="w-4 h-4" />,
      badge: stats?.activeApplications,
    },
    {
      id: 'schedules',
      label: 'Rules & Schedules',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: 'analytics',
      label: 'AI Analytics',
      icon: <Layers className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40 p-4 flex flex-col justify-between select-none transition-colors duration-200">
      <div className="space-y-6">
        <div className="px-2 py-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2">
            Main Navigation
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : item.isPrimary
                      ? 'bg-indigo-50/70 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100/70'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={isActive ? 'text-white' : ''}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>

                  {item.isLive && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}

                  {item.badge !== undefined && !item.isLive && Number(item.badge) > 0 && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        isActive
                          ? 'bg-indigo-700 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
};
