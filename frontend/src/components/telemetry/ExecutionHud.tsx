import React from 'react';
import { Activity } from 'lucide-react';
import type { AutomationRunStatus } from '../../types';
import { cleanJobTitle } from './parseEventData';

interface Props {
  activeRun: AutomationRunStatus | null;
  currentExecutionState: string;
}

export const ExecutionHud: React.FC<Props> = ({ activeRun, currentExecutionState }) => (
  <div className="p-3 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 shrink-0 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
          Live Automation Active
        </span>
      </div>

      <span className="px-2 py-0.5 rounded-md bg-white/90 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {activeRun?.active_state || currentExecutionState}
      </span>
    </div>

    {activeRun?.current_job_title && (
      <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-900/90 px-2.5 py-1 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
        <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
        <span className="text-[10px] text-slate-400 shrink-0">Active Target:</span>
        <span className="font-bold truncate text-indigo-950 dark:text-indigo-200">
          {cleanJobTitle(activeRun.current_job_title)}
        </span>
      </div>
    )}

    {/* 5-Stage Stepper */}
    <div className="grid grid-cols-5 gap-1 pt-0.5">
      {[
        { id: 'DISCOVERING', label: '1. Discover' },
        { id: 'MATCHING', label: '2. AI Match' },
        { id: 'NAVIGATING', label: '3. Navigate' },
        { id: 'APPLYING', label: '4. Form Fill' },
        { id: 'SUBMITTED', label: '5. Submitted' },
      ].map((step, idx) => {
        const state = activeRun?.active_state || currentExecutionState;
        let isCurrent = false;
        let isPassed = false;

        if (step.id === 'DISCOVERING') {
          isCurrent = state === 'DISCOVERING';
          isPassed = state === 'MATCHING' || state === 'APPLYING' || state === 'FINISHED' || state === 'COMPLETED';
        } else if (step.id === 'MATCHING') {
          isCurrent = state === 'MATCHING';
          isPassed = state === 'APPLYING' || state === 'FINISHED' || state === 'COMPLETED';
        } else if (step.id === 'NAVIGATING') {
          isCurrent = state === 'APPLYING' && !activeRun?.applications_submitted_count;
          isPassed = Boolean(activeRun?.applications_submitted_count);
        } else if (step.id === 'APPLYING') {
          isCurrent = state === 'APPLYING';
          isPassed = Boolean(activeRun?.applications_submitted_count);
        } else if (step.id === 'SUBMITTED') {
          isCurrent = state === 'FINISHED' || state === 'COMPLETED';
          isPassed = (activeRun?.applications_submitted_count ?? 0) > 0;
        }

        return (
          <div
            key={idx}
            className={`text-center py-1 px-1 rounded-md text-[9px] font-bold transition-all ${
              isCurrent
                ? 'bg-indigo-600 text-white shadow-2xs animate-pulse'
                : isPassed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  </div>
);
