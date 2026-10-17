import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { BarChart3 } from 'lucide-react';
import type { FunnelOverview, SourcePerformanceMetric } from '../../types';

interface Props {
  funnel: FunnelOverview | null;
  sources: SourcePerformanceMetric[];
}

export const SourcesSection: React.FC<Props> = ({ funnel, sources }) => (
  <>
    {/* Section 4B: Platform Performance Matrix (Unified Funnel Contract) */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Platform &amp; ATS Performance</span>
          </h2>
          <p className="text-xs text-slate-500">Attribution across job boards using unified funnel stage metrics.</p>
        </div>
        <span className="text-xs text-slate-400 font-mono">Attribution</span>
      </div>

      <div className="space-y-3 pt-1">
        {sources.length === 0 ? (
          <EmptyState>No platform telemetry recorded for this date range yet.</EmptyState>
        ) : (
          sources.map((src) => (
            <div
              key={src.source_id}
              className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {src.source_type ? src.source_type.toUpperCase() : src.source_id}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {src.discovered_count} Discovered • {src.applied_count} Submitted
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                  <span>{src.response_count ?? 0} responses</span>
                  <span>•</span>
                  <span>{src.interview_count ?? 0} interviews</span>
                  <span>•</span>
                  <span>{src.offer_count ?? 0} offers</span>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0 text-xs font-mono">
                <div className="text-purple-600 dark:text-purple-400 font-bold">
                  {(src.interview_rate_pct ?? 0).toFixed(1)}% Interview
                </div>
                <div className="text-[10px] text-slate-400">
                  {(src.response_rate_pct ?? src.success_rate_pct ?? 0).toFixed(1)}% Response
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </>
);
