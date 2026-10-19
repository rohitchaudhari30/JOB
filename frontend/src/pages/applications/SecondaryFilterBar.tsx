import React from 'react';
import { X, Building2, Zap } from 'lucide-react';

interface Props {
  showFilterPanel: boolean;
  hasActiveSecondaryFilters: boolean;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  minMatchFilter: number;
  setMinMatchFilter: (v: number) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
}

export const SecondaryFilterBar: React.FC<Props> = ({
  showFilterPanel,
  hasActiveSecondaryFilters,
  companyFilter,
  setCompanyFilter,
  minMatchFilter,
  setMinMatchFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
}) => (
  <>
    {/* Secondary Filter Bar matching Image 1 */}
    {showFilterPanel && (
      <div className="px-3.5 pb-3.5 pt-2 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 animate-fadeIn">
        {/* 1. Company Input with Building icon */}
        <div className="relative flex items-center min-w-[180px] max-w-[220px] flex-1 sm:flex-initial">
          <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="Company"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {companyFilter && (
            <button type="button"
              aria-label="Close"
              onClick={() => setCompanyFilter('')}
              className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2. Min match % Input with Zap icon */}
        <div className="relative flex items-center min-w-[140px] max-w-[170px] flex-1 sm:flex-initial">
          <Zap className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="number"
            min="0"
            max="100"
            value={minMatchFilter || ''}
            onChange={(e) => setMinMatchFilter(e.target.value ? Number(e.target.value) : 0)}
            placeholder="Min match %"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* 3. From Date with Calendar picker */}
        <div className="relative flex items-center px-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white min-w-[190px] max-w-[220px] flex-1 sm:flex-initial">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-2 select-none shrink-0">
            From
          </span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full text-xs bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
          />
        </div>

        {/* 4. To Date with Calendar picker */}
        <div className="relative flex items-center px-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white min-w-[190px] max-w-[220px] flex-1 sm:flex-initial">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mr-2 select-none shrink-0">
            To
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full text-xs bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
          />
        </div>

        {/* Reset link if any secondary filter is set */}
        {hasActiveSecondaryFilters && (
          <button type="button"
            onClick={() => {
              setCompanyFilter('');
              setMinMatchFilter(0);
              setFromDate('');
              setToDate('');
            }}
            className="text-[11px] font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 underline cursor-pointer ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>
    )}
  </>
);
