import React from 'react';
import { CheckCircle2, Sparkles, Building2, AlertTriangle } from 'lucide-react';
import type { computeStats } from './applicationLogic';

interface Props {
  stats: ReturnType<typeof computeStats>;
  selectedFilter: string;
  setSelectedFilter: (v: string) => void;
  sortColumn: 'date' | 'match' | 'status';
  sortDirection: 'asc' | 'desc';
  setSortColumn: (v: 'date' | 'match' | 'status') => void;
  setSortDirection: (v: 'asc' | 'desc') => void;
}

/** Four clickable KPI cards above the pipeline; clicking toggles the matching filter or sort. */
export const ApplicationKpis: React.FC<Props> = ({
  stats, selectedFilter, setSelectedFilter, sortColumn, sortDirection, setSortColumn, setSortDirection,
}) => (
  <>
    {/* Dynamic Operational KPI Cards — Compact Industry Standard */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Card 1: Successfully Applied */}
      <div
        onClick={() => setSelectedFilter(selectedFilter === 'Applied' ? 'All' : 'Applied')}
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
          selectedFilter === 'Applied'
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:border-emerald-500'
            : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Successfully Applied</span>
          <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1 flex items-baseline space-x-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {stats.appliedCount}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
            {stats.successRate}% rate
          </span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {stats.appliedTodayCount > 0 ? `+${stats.appliedTodayCount} submitted today` : 'Direct submissions'}
        </div>
      </div>

      {/* Card 2: Match Quality */}
      <div
        onClick={() => {
          setSortColumn('match');
          setSortDirection(sortColumn === 'match' && sortDirection === 'desc' ? 'asc' : 'desc');
        }}
        className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group shadow-2xs hover:shadow-xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Match Quality</span>
          <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1 flex items-baseline space-x-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {stats.avgMatch > 0 ? `${stats.avgMatch}%` : '-'}
          </span>
          {stats.avgMatch > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40">
              {stats.avgMatch >= 75 ? 'High fit' : stats.avgMatch >= 60 ? 'Moderate' : 'Fair'}
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {sortColumn === 'match' ? (
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">Sorted by match {sortDirection === 'desc' ? '↓' : '↑'}</span>
          ) : (
            `Across ${stats.scoredJobsCount} scored roles`
          )}
        </div>
      </div>

      {/* Card 3: Company Sites / Redirects */}
      <div
        onClick={() => setSelectedFilter(selectedFilter === 'Company site' ? 'All' : 'Company site')}
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
          selectedFilter === 'Company site'
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10 dark:border-blue-500'
            : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Company Site Redirects</span>
          <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1 flex items-baseline space-x-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {stats.companySiteCount}
          </span>
          {stats.companySiteCount > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100 dark:border-blue-800/40">
              Needs manual apply
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              All on portal
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {stats.companySiteCount > 0 ? 'External career portals' : 'No external redirects'}
        </div>
      </div>

      {/* Card 4: Issues & Skipped */}
      <div
        onClick={() => setSelectedFilter(selectedFilter === 'Failed' ? 'All' : 'Failed')}
        className={`p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer group shadow-2xs hover:shadow-xs ${
          selectedFilter === 'Failed'
            ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10 dark:border-rose-500'
            : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Audit &amp; Skipped</span>
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              stats.issuesCount > 0
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-1 flex items-baseline space-x-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {stats.issuesCount}
          </span>
          {stats.issuesCount > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-100 dark:border-rose-800/40">
              {stats.failedCount} fail · {stats.skippedCount} skip
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/40">
              All clear
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {stats.issuesCount > 0 ? 'Diagnostics & errors logged' : '0 errors or blocks'}
        </div>
      </div>
    </div>
  </>
);
