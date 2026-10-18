import React from 'react';
import { Play, Tv } from 'lucide-react';
import type { DashboardOverview } from '../../types';

interface Props {
  overview: DashboardOverview | null;
  effectiveRunning: boolean | undefined;
  effectiveStatus: string;
  onNavigate: (tab: any) => void;
}

export const OperationalCommandCard: React.FC<Props> = ({
  overview,
  effectiveRunning,
  effectiveStatus,
  onNavigate,
}) => (
  <>
    {/* 3. Operational Command Card: Active Run or Idle Readiness */}
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                effectiveRunning
                  ? 'bg-emerald-500 animate-pulse'
                  : effectiveStatus.startsWith('PAUSED')
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {effectiveRunning
                    ? overview?.active_run.campaign_name || 'Active Automation Execution'
                    : effectiveStatus.startsWith('PAUSED')
                      ? 'Automation Session Paused'
                      : 'Automation Engine Idle'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    effectiveRunning
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : effectiveStatus.startsWith('PAUSED')
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {effectiveStatus}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {effectiveRunning
                  ? `Currently processing: ${overview?.active_run.current_job_title || 'Target Job Match'} via ${overview?.active_run.current_platform || 'Connected Adapter'}`
                  : effectiveStatus.startsWith('PAUSED')
                    ? 'Session is waiting for manual intervention or safe cooldown resolution.'
                    : 'System is ready to execute scheduled discovery, matching, and safe auto-apply.'}
              </p>
            </div>
          </div>

          {/* Active Run Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {effectiveRunning || effectiveStatus.startsWith('PAUSED') ? (
              <button type="button"
                onClick={() => onNavigate('live_console')}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Tv className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open live run</span>
              </button>
            ) : (
              <button type="button"
                onClick={() => onNavigate('direct_apply')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Auto-Apply</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar if running */}
        {effectiveRunning && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Execution Progress</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {overview?.active_run.progress_percentage.toFixed(0) || 0}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, overview?.active_run.progress_percentage || 0))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  </>
);
