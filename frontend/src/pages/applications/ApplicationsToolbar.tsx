import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

interface Props {
  filterChips: { id: string; label: string; count: number; dotColor?: string }[];
  hasActiveSecondaryFilters: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedFilter: string;
  setSelectedFilter: (v: string) => void;
  showFilterPanel: boolean;
  setShowFilterPanel: (v: boolean) => void;
}

export const ApplicationsToolbar: React.FC<Props> = ({
  filterChips,
  hasActiveSecondaryFilters,
  searchQuery,
  setSearchQuery,
  selectedFilter,
  setSelectedFilter,
  showFilterPanel,
  setShowFilterPanel,
}) => (
  <>
    {/* Industry-Standard Top Bar: Search + Filter Chips + Filters Button */}
    <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
      {/* Left: Search input */}
      <div className="relative flex items-center min-w-[260px] max-w-sm flex-1 sm:flex-initial">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title or company"
          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
        />
        {searchQuery && (
          <button
            aria-label="Close"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Middle: Horizontal Filter Chips with live counts */}
      <div className="flex items-center flex-wrap gap-1.5 overflow-x-auto py-1">
        {filterChips.map((chip) => {
          const isActive = selectedFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setSelectedFilter(chip.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-white dark:border-slate-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {chip.dotColor && <span className={`w-2 h-2 rounded-full ${chip.dotColor} shrink-0`} />}
              <span>{chip.label}</span>
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500'
                }`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: Filters Toggle Button */}
      <button
        onClick={() => setShowFilterPanel(!showFilterPanel)}
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
          showFilterPanel || hasActiveSecondaryFilters
            ? 'border-indigo-300 bg-indigo-50/60 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Filters</span>
        {hasActiveSecondaryFilters && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
      </button>
    </div>
  </>
);
