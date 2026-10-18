import React from 'react';
import { LayoutDashboard, Play, Tv, Clock, RefreshCw } from 'lucide-react';

interface Props {
  clientTz: string;
  loadData: (isRefresh?: boolean) => void;
  loading: boolean;
  refreshing: boolean;
  onNavigate: (tab: any) => void;
}

export const DashboardHeader: React.FC<Props> = ({ clientTz, loadData, loading, refreshing, onNavigate }) => (
  <>
    {/* 1. Header & Operational Status Bar */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center shadow-xs">
          <LayoutDashboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              Command Center
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Real-time automation controls, blocker triage, daily quota pacing, and recommended actions.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Local Timezone Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            Quota Zone: <strong className="font-semibold">{clientTz}</strong>
          </span>
        </div>

        <button type="button"
          aria-label="Refresh"
          onClick={() => loadData(true)}
          disabled={refreshing || loading}
          title="Refresh Operational State"
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
        </button>

        <button type="button"
          onClick={() => onNavigate('live_console')}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <Tv className="w-3.5 h-3.5 text-indigo-500" />
          <span>Live Console</span>
        </button>

        <button type="button"
          onClick={() => onNavigate('direct_apply')}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Start Campaign</span>
        </button>
      </div>
    </div>
  </>
);
