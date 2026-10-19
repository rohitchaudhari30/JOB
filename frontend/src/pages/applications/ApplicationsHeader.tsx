import React from 'react';
import { RefreshCw, Briefcase } from 'lucide-react';
import type { computeStats } from './applicationLogic';

interface Props {
  loadData: () => void;
  loading: boolean;
  stats: ReturnType<typeof computeStats>;
}

export const ApplicationsHeader: React.FC<Props> = ({ loadData, loading, stats }) => (
  <>
    {/* Top Header & Scout Status */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-xs">
      <div className="flex items-center space-x-3.5">
        <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Application CRM</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Every job the automation reached, and what happened to it.
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-2.5 self-end sm:self-center">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-bold text-indigo-700 dark:text-indigo-300">
          <span>Tracked:</span>
          <span>{stats.total}</span>
        </div>

        <button type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          title="Refresh pipeline"

          aria-label="Refresh pipeline"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  </>
);
