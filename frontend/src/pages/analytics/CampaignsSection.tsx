import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Target, ChevronRight } from 'lucide-react';
import type { CampaignPerformanceMetric } from '../../types';

interface Props {
  campaigns: CampaignPerformanceMetric[];
  onNavigate: ((tab: any) => void) | undefined;
}

export const CampaignsSection: React.FC<Props> = ({ campaigns, onNavigate }) => (
  <>
    {/* 5. Campaign Performance Attribution (First-Class Matrix) */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Campaign Performance Attribution</span>
          </h2>
          <p className="text-xs text-slate-500">
            Explicit multi-stage telemetry showing which campaigns produce verified interviews.
          </p>
        </div>
        <button
          onClick={() => onNavigate?.('direct_apply')}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
        >
          <span>Manage Campaigns</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {campaigns.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 pb-2">
                <th className="py-2.5 font-bold uppercase text-[10px]">Campaign</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Discovered</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Matched</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Triggered</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Submitted</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Interviews</th>
                <th className="py-2.5 font-bold uppercase text-[10px]">Offers</th>
                <th className="py-2.5 font-bold uppercase text-[10px] text-right">Interview Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {campaigns.map((c) => (
                <tr key={c.campaign_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-semibold text-slate-900 dark:text-white">
                    <div>{c.campaign_name}</div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">{c.state}</span>
                  </td>
                  <td className="py-3 font-mono text-slate-600 dark:text-slate-400">{c.discovered_count}</td>
                  <td className="py-3 font-mono text-slate-600 dark:text-slate-400">
                    {c.matched_count ?? c.discovered_count}
                  </td>
                  <td className="py-3 font-mono text-slate-600 dark:text-slate-400">
                    {c.triggered_count ?? c.applied_count}
                  </td>
                  <td className="py-3 font-mono text-slate-900 dark:text-white font-bold">
                    {c.submitted_count ?? c.applied_count}
                  </td>
                  <td className="py-3 font-mono text-purple-600 dark:text-purple-400 font-bold">
                    {c.interview_count ?? 0}
                  </td>
                  <td className="py-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {c.offer_count ?? 0}
                  </td>
                  <td className="py-3 font-mono text-right text-purple-600 dark:text-purple-400 font-bold">
                    {(c.interview_rate_pct ?? 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No active campaigns executed within this time window.</EmptyState>
      )}
    </div>
  </>
);
