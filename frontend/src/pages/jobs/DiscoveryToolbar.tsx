import React from 'react';
import { Search, Sparkles, ArrowUpDown, ShieldCheck } from 'lucide-react';
import type { Job } from '../../types';

interface DiscoveryToolbarProps {
  appliedTodayCount: number;
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

/** Freshness chips, top-fit filter, sort and search. */
export const DiscoveryToolbar: React.FC<DiscoveryToolbarProps> = ({
  appliedTodayCount,
  filterMinFit,
  jobs,
  postedWithin,
  searchQuery,
  setFilterMinFit,
  setPostedWithin,
  setSearchQuery,
  setSortBy,
  sortBy,
}) => (
  <>
    {/* Freshness & Filter Toolbar */}
    <div className="p-4 rounded-2xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* Segmented Freshness Filter Chips + Anti-Ban & Top Fit */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Freshness:</span>
        {[
          { label: '🔥 Past 24 Hours', value: '24h' },
          { label: '⚡ Last 1 Hour', value: '1h' },
          { label: '📅 Past 3 Days', value: '3d' },
          { label: '📅 Past 7 Days', value: '7d' },
          { label: '🌐 All Time', value: 'all' },
        ].map((chip) => {
          const isSelected = postedWithin === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setPostedWithin(chip.value)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {chip.label}
            </button>
          );
        })}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

        {/* Top Fit Filter Toggle */}
        <button
          onClick={() => setFilterMinFit((prev) => !prev)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border ${
            filterMinFit
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
          }`}
          title="Show only jobs with >= 80% AI match score"
        >
          <Sparkles className={`w-3.5 h-3.5 ${filterMinFit ? 'text-amber-300' : 'text-amber-500'}`} />
          <span>Top Fit (&gt;80%)</span>
        </button>

        {/* Anti-Ban Daily Safe Limit Badge */}
        <div
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border ${
            appliedTodayCount >= 20
              ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80'
          }`}
          title="Safe daily cap: 20 applications/day prevents anti-bot spam detection and account throttling."
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Safe Cap: {appliedTodayCount}/20 today</span>
        </div>
      </div>

      {/* Detailed Controls: Sort By & Search */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Sort By Dropdown */}
        <div className="flex items-center space-x-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            aria-label="Sort jobs"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="freshness">Best Freshness Score</option>
            <option value="salary_high_to_low">Salary: High to Low</option>
            <option value="salary_low_to_high">Salary: Low to High</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  </>
);
