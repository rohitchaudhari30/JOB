import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { CompletedSummary } from './useLiveStream';

interface Props {
  completedSummary: CompletedSummary;
  onDismiss: () => void;
  onNavigate: ((tab: any) => void) | undefined;
}

export const CompletionBanner: React.FC<Props> = ({ completedSummary, onDismiss, onNavigate }) => (
  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
    <div className="flex items-center space-x-3.5">
      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-6 h-6" />
      </div>
      <div>
        <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100 flex items-center space-x-2">
          <span>All Automation Tasks Completed!</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200 font-bold">
            100% DONE
          </span>
        </div>
        <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
          {completedSummary.message} — Discovered: <strong>{completedSummary.discovered}</strong> • Matched:{' '}
          <strong>{completedSummary.matched}</strong> • Applied: <strong>{completedSummary.applied}</strong>
        </div>
      </div>
    </div>
    <div className="flex items-center space-x-2 shrink-0">
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('crm')}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          View Applications
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onDismiss();
        }}
        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
      >
        Dismiss
      </button>
    </div>
  </div>
);
