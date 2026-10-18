import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface Props {
  loading: boolean;
  isEvaluatingAll: boolean;
  handleEvaluateAll: () => void;
  loadAllMatches: () => void;
}

export const MatchesHero: React.FC<Props> = ({ loading, isEvaluatingAll, handleEvaluateAll, loadAllMatches }) => (
  <>
    {/* Hero Header */}
    <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-white via-indigo-50/20 to-white dark:from-slate-900/90 dark:via-indigo-950/20 dark:to-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div>
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              AI Job Matches
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Compatibility scoring and skill alignment based on your profile and preferences.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button type="button"
          onClick={loadAllMatches}
          disabled={loading}
          className="p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-xs"
          title="Refresh AI Matches"

          aria-label="Refresh AI Matches"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>

        <button type="button"
          onClick={handleEvaluateAll}
          disabled={isEvaluatingAll}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isEvaluatingAll ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Running AI Matching...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>Run AI Matching</span>
            </>
          )}
        </button>
      </div>
    </div>
  </>
);
