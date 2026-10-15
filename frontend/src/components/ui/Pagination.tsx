import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  /** Shown next to the range when the list is filtered. */
  onResetFilters?: () => void;
}

const buttonBase =
  'rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 ' +
  'disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400 transition-colors cursor-pointer';

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  onResetFilters,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
      <div className="flex items-center space-x-3">
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium select-none">
          Showing {first}–{last} of {total}
        </span>
        {onResetFilters && (
          <button
            onClick={onResetFilters}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
          >
            (Reset filters)
          </button>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <label className="flex items-center space-x-1.5">
          <span className="text-[11px] text-slate-400">Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="text-xs py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center space-x-1">
          <span className="text-xs text-slate-400 dark:text-slate-500 mr-1 select-none">
            Page {page} of {totalPages}
          </span>
          <button
            aria-label="First page"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className={`${buttonBase} px-2 py-1 text-xs font-semibold`}
          >
            &laquo;
          </button>
          <button
            aria-label="Previous page"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={`${buttonBase} p-1.5`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label="Next page"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={`${buttonBase} p-1.5`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label="Last page"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className={`${buttonBase} px-2 py-1 text-xs font-semibold`}
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  );
};
