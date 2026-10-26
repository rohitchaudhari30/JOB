import React from 'react';
import { Search, Sparkles, ArrowUpDown } from 'lucide-react';
import type { Job } from '../../types';

interface DiscoveryToolbarProps {
  appliedTodayCount?: number;
  filterMinFit: boolean;
  jobs: Job[];
  postedWithin: string;
  searchQuery: string;
  setFilterMinFit: React.Dispatch<React.SetStateAction<boolean>>;
  setPostedWithin: (v: string) => void;
  setSearchQuery: (v: string) => void;
  setSortBy: (v: string) => void;
  sortBy: string;
}

const FRESHNESS_OPTIONS = [
  { label: '24h', full: 'Past 24 Hours', value: '24h' },
  { label: '1h', full: 'Last 1 Hour', value: '1h' },
  { label: '3d', full: 'Past 3 Days', value: '3d' },
  { label: '7d', full: 'Past 7 Days', value: '7d' },
  { label: 'All', full: 'All Time', value: 'all' },
];

/** Industry-standard single-row discovery toolbar: segmented freshness, top fit toggle, sort and search. */
export const DiscoveryToolbar: React.FC<DiscoveryToolbarProps> = ({
  filterMinFit,
  postedWithin,
  searchQuery,
  setFilterMinFit,
  setPostedWithin,
  setSearchQuery,
  setSortBy,
  sortBy,
}) => (
  <div className="p-3 sm:px-4 sm:py-3 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
    {/* Left: Freshness Segmented Control + Top Fit Filter */}
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden sm:inline">
          Posted:
        </span>
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
          {FRESHNESS_OPTIONS.map((chip) => {
            const isSelected = postedWithin === chip.value;
            return (
              <button
                type="button"
                key={chip.value}
                onClick={() => setPostedWithin(chip.value)}
                title={chip.full}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

      {/* Top Fit Filter Toggle */}
      <button
        type="button"
        onClick={() => setFilterMinFit((prev) => !prev)}
        className={`h-9 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
          filterMinFit
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
        }`}
        title="Show only jobs with >= 80% AI match score"
      >
        <Sparkles className={`w-3.5 h-3.5 ${filterMinFit ? 'text-amber-300' : 'text-amber-500'}`} />
        <span>Top Fit (&gt;80%)</span>
      </button>
    </div>

    {/* Right: Sort By & Search Controls */}
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Sort By Dropdown */}
      <div className="relative">
        <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <select
          aria-label="Sort jobs"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-9 pl-7 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer shadow-xs transition"
        >
          <option value="newest">Newest First</option>
          <option value="freshness">Best Match</option>
          <option value="salary_high_to_low">Salary: High to Low</option>
          <option value="salary_low_to_high">Salary: Low to High</option>
        </select>
      </div>

      {/* Search Input */}
      <div className="relative w-44 sm:w-56">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-9 pl-8 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  </div>
);
