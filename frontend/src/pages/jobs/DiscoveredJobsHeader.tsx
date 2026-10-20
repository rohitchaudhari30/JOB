import React from 'react';
import { Trash2, CheckSquare, Square } from 'lucide-react';
import type { Job } from '../../types';

interface Props {
  totalCount: number;
  pageSize: number;
  page: number;
  displayedJobs: Job[];
  allSelected: boolean;
  handleSelectAll: () => void;
  handleSelectTopN: (n: number) => void;
  selectedCount: number;
  jobs: Job[];
  showConfirmClear: boolean;
  setShowConfirmClear: (v: boolean) => void;
  isClearing: boolean;
  handleClearAll: () => void;
}

export const DiscoveredJobsHeader: React.FC<Props> = ({
  totalCount,
  pageSize,
  page,
  displayedJobs,
  allSelected,
  handleSelectAll,
  handleSelectTopN,
  selectedCount,
  jobs,
  showConfirmClear,
  setShowConfirmClear,
  isClearing,
  handleClearAll,
}) => (
  <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center space-x-3">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Jobs found ({totalCount} total{totalCount > pageSize ? ` · page ${page}` : ''})
        </h2>
        {displayedJobs.length > 0 && (
          <div className="flex items-center space-x-2">
            <button type="button"
              onClick={handleSelectAll}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center space-x-1 cursor-pointer"
            >
              {allSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Select All ({displayedJobs.length})</span>
                </>
              )}
            </button>

            {displayedJobs.length >= 5 && (
              <button type="button"
                onClick={() => handleSelectTopN(5)}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                title="Select top 5 newest jobs"
              >
                ⚡ Top 5
              </button>
            )}
            {displayedJobs.length >= 10 && (
              <button type="button"
                onClick={() => handleSelectTopN(10)}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                title="Select top 10 newest jobs"
              >
                ⚡ Top 10
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {jobs.length > 0 && (
          <div>
            {!showConfirmClear ? (
              <button type="button"
                onClick={() => setShowConfirmClear(true)}
                className="px-3 py-1 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All ({jobs.length})</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 animate-fadeIn bg-rose-50 dark:bg-rose-950/50 px-3 py-1 rounded-xl border border-rose-200 dark:border-rose-900/80">
                <span className="text-xs text-rose-700 dark:text-rose-300 font-semibold">
                  Delete all {jobs.length} jobs?
                </span>
                <button type="button"
                  onClick={handleClearAll}
                  disabled={isClearing}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isClearing ? 'Clearing...' : 'Yes, Delete'}
                </button>
                <button type="button"
                  onClick={() => setShowConfirmClear(false)}
                  className="px-2 py-0.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </>
);
