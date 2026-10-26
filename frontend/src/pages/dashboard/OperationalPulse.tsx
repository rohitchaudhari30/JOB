import React from 'react';
import { Activity, Inbox, TrendingUp, CheckCircle2, ArrowRight } from 'lucide-react';
import type { DashboardOverview, ApplicationStats } from '../../types';

interface Props {
  overview: DashboardOverview | null;
  connections: any[];
  appStats?: ApplicationStats | null;
  onNavigate: (tab: any) => void;
}

export const OperationalPulse: React.FC<Props> = ({ overview, appStats, onNavigate }) => {
  const approvalRequired = appStats?.approval_required ?? 0;
  const needsAttentionCount = (overview?.needs_attention?.length ?? 0) + (appStats?.needs_attention ?? 0);
  const totalAttentionCount = approvalRequired + needsAttentionCount;

  const totalApps = appStats?.total ?? 0;
  const submittedCount = appStats?.applied ?? 0;
  const successRate = appStats?.success_rate != null ? Math.round(appStats.success_rate) : 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1: Applications Today / Daily Cap */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Applications Today</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {overview?.today_applied_count ?? 0}
            </span>
            <span className="text-slate-400 font-mono text-lg font-bold">/ {overview?.effective_daily_limit ?? 30}</span>
          </div>

          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (overview?.quota_percentage ?? 0) >= 100
                    ? 'bg-rose-500'
                    : (overview?.quota_percentage ?? 0) >= 80
                      ? 'bg-amber-500'
                      : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.min(100, overview?.quota_percentage ?? 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{overview?.quota_remaining ?? 0} applications remaining</span>
              <span className="font-semibold">{overview?.quota_percentage?.toFixed(0) ?? 0}%</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Safety Limit Source:</span>
          <span className="font-semibold text-slate-600 dark:text-slate-300">min(Campaign, Platform, Account)</span>
        </div>
      </div>

      {/* Card 2: Action Required / Review Queue */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Action Required</span>
            <Inbox className={`w-4 h-4 ${totalAttentionCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {totalAttentionCount}
            </span>
            <span className="text-slate-400 font-mono text-xs font-semibold">
              {totalAttentionCount === 1 ? 'item needs review' : 'items need review'}
            </span>
          </div>

          <div className="space-y-1.5 pt-1 text-xs">
            {totalAttentionCount > 0 ? (
              <>
                {approvalRequired > 0 && (
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Pending Approval
                    </span>
                    <span className="font-bold">{approvalRequired}</span>
                  </div>
                )}
                {needsAttentionCount > 0 && (
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Action Items
                    </span>
                    <span className="font-bold">{needsAttentionCount}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 py-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">All queues clear. No pending reviews.</span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Review Queue</span>
          <button
            type="button"
            onClick={() => onNavigate('applications')}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            Open Queue <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Card 3: Application Pipeline Health */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Application Pipeline</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {totalApps}
            </span>
            <span className="text-slate-400 font-mono text-xs font-semibold">total tracked</span>
          </div>

          <div className="space-y-1.5 pt-1 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Submitted
              </span>
              <span className="font-bold">{submittedCount}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Delivery Rate
              </span>
              <span className="font-bold">{successRate}%</span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>CRM Tracking</span>
          <button
            type="button"
            onClick={() => onNavigate('applications')}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
          >
            View CRM Pipeline <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
