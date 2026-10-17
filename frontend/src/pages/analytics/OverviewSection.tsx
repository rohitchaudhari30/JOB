import React from 'react';
import { Layers, Sparkles, CheckCircle2, Award, Globe, ArrowUpRight } from 'lucide-react';
import type { FunnelOverview } from '../../types';

interface Props {
  funnel: FunnelOverview | null;
  onNavigate: ((tab: any) => void) | undefined;
}

export const OverviewSection: React.FC<Props> = ({ funnel, onNavigate }) => (
  <>
    {/* 2. Executive KPI Cards: Separate Response, Interview, and Offer Rates */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Confirmed Submissions */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Confirmed Submissions</span>
          <CheckCircle2 className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="text-3xl font-black font-mono text-slate-900 dark:text-white">
          {funnel?.total_submitted ?? funnel?.total_applied ?? 0}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {funnel && (funnel.total_triggered ?? funnel.total_applied ?? 0) > 0
            ? `${(funnel.submission_rate_pct ?? 100).toFixed(1)}% of triggered applications confirmed`
            : 'Verified form submissions'}
        </p>
      </div>

      {/* Employer Response Rate */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Employer Response Rate</span>
          <Globe className="w-4 h-4 text-blue-500" />
        </div>
        <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
          {(funnel?.response_rate_pct ?? 0).toFixed(1)}%
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {funnel?.total_responded ?? 0} recruiter responses &amp; follow-ups
        </p>
      </div>

      {/* Interview Rate */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Interview Rate</span>
          <Award className="w-4 h-4 text-purple-500" />
        </div>
        <div className="text-3xl font-black font-mono text-purple-600 dark:text-purple-400">
          {(funnel?.interview_rate_pct ?? 0).toFixed(1)}%
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {funnel?.total_interviewed ?? 0} screening &amp; technical rounds scheduled
        </p>
      </div>

      {/* Offer Rate */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Offer Rate</span>
          <Sparkles className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
          {(funnel?.offer_rate_pct ?? 0).toFixed(1)}%
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {funnel?.total_offered ?? 0} formal job offers received
        </p>
      </div>
    </div>

    {/* 3. The Complete 7-Stage Conversion Funnel */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Full Conversion Funnel (7 Stages)</span>
          </h2>
          <p className="text-xs text-slate-500">
            End-to-end drop-off progression from discovery to confirmed job offers.
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono">Telemetry Flow</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {funnel?.stages && funnel.stages.length > 0 ? (
          funnel.stages.map((stage, idx) => {
            const targetTab =
              stage.stage_name === 'Discovered' ? 'discovery' : stage.stage_name === 'AI Matched' ? 'matches' : 'crm';

            return (
              <div
                key={stage.stage_name}
                onClick={() => onNavigate?.(targetTab)}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 hover:border-indigo-400 dark:bg-slate-800/40 dark:border-slate-800 dark:hover:border-indigo-500/60 flex flex-col justify-between transition-all cursor-pointer group shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Stage {idx + 1}
                    </span>
                    <ArrowUpRight className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-xs leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {stage.stage_name}
                  </h3>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xl font-black text-indigo-600 dark:text-indigo-300 font-mono">
                    {stage.count}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {stage.conversion_rate_pct.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(stage.conversion_rate_pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-7 p-6 text-center text-xs text-slate-400">
            No conversion stage activity recorded in this date range.
          </div>
        )}
      </div>
    </div>
  </>
);
