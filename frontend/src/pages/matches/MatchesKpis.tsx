import React from 'react';
import { CheckCircle2, Clock, BarChart3, Target } from 'lucide-react';

interface Props {
  stats: { total: number; autoApply: number; review: number; strong: number; avg: number };
}

export const MatchesKpis: React.FC<Props> = ({ stats }) => (
  <>
    {/* KPI Stats Bar */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Evaluated</div>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{stats.total}</div>
          <div className="text-[10px] text-slate-400">Active Pipeline</div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Strong Matches</div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{stats.strong}</div>
          <div className="text-[10px] text-slate-400">Score &ge; 60%</div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Review Required</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">{stats.review}</div>
          <div className="text-[10px] text-slate-400">Score &ge; 75%</div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
        <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg Compatibility</div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono">{stats.avg}%</div>
          <div className="text-[10px] text-slate-400">5-Stage Average</div>
        </div>
      </div>
    </div>
  </>
);
