import React from 'react';
import { ArrowUpRight, FileText, ChevronRight } from 'lucide-react';
import type { Application } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';

interface Props {
  recentApplications: Application[];
  onNavigate: (tab: any) => void;
}

export const RecentActivityCard: React.FC<Props> = ({ recentApplications, onNavigate }) => (
  <>
    {/* 6. Recent Application Activity Stream */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Application Activity</h2>
            <p className="text-xs text-slate-500">
              Latest submissions and execution states from your automation pipeline.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('crm')}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
        >
          <span>Open Application CRM</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {recentApplications.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentApplications.map((app) => (
            <div
              key={app.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 first:pt-0 last:pb-0"
            >
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                  {app.job_title || `Application #${app.id.slice(-8)}`}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {app.company ? `${app.company} • ` : ''}Job ID: {app.job_id.slice(-10)} • Created:{' '}
                  {new Date(app.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Technical Execution State */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    app.workflow_state === 'APPLIED'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : app.workflow_state.startsWith('PAUSED')
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : app.workflow_state === 'FAILED'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {app.workflow_state}
                </span>

                {/* Business CRM Outcome Status */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    app.outcome_status === 'SUBMITTED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : app.outcome_status === 'INTERVIEWING'
                        ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                        : app.outcome_status === 'OFFERED'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}
                >
                  {app.outcome_status || 'NOT_SUBMITTED'}
                </span>

                <button
                  aria-label="Open"
                  onClick={() => onNavigate('crm')}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>
          No applications submitted yet. Start your first campaign to begin applying automatically.
        </EmptyState>
      )}
    </div>
  </>
);
