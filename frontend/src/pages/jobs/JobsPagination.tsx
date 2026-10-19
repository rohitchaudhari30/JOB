import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageSize: number;
  totalCount: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

export const JobsPagination: React.FC<Props> = ({ page, pageSize, totalCount, setPage }) => (
  <>
    {/* Pagination Controls */}
    {totalCount > pageSize && (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-6 border-t border-slate-200/60 dark:border-slate-800">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Showing{' '}
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {Math.min((page - 1) * pageSize + 1, totalCount)}
          </span>{' '}
          to{' '}
          <span className="font-bold text-slate-800 dark:text-slate-200">{Math.min(page * pageSize, totalCount)}</span>{' '}
          of <span className="font-bold text-slate-800 dark:text-slate-200">{totalCount}</span> opportunities
        </div>
        <div className="flex items-center space-x-2">
          <button type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, Math.ceil(totalCount / pageSize)) }, (_, i) => {
              const totalPages = Math.ceil(totalCount / pageSize);
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              const isCurrent = page === pageNum;
              return (
                <button type="button"
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button type="button"
            onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
            disabled={page >= Math.ceil(totalCount / pageSize)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors flex items-center space-x-1 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )}
  </>
);
