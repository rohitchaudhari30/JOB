import React from 'react';
import { Sliders, Search, X, ArrowUpDown } from 'lucide-react';
import type { MatchResult } from '../../types';

interface Props {
  allMatches: MatchResult[];
  filteredAndSortedMatches: MatchResult[];
  minScoreFilter: number;
  setMinScoreFilter: (n: number) => void;
  decisionFilter: string;
  setDecisionFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
}

export const MatchesToolbar: React.FC<Props> = ({
  allMatches,
  filteredAndSortedMatches,
  minScoreFilter,
  setMinScoreFilter,
  decisionFilter,
  setDecisionFilter,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
}) => (
  <>
    {/* Filter and Control Toolbar */}
    <div className="p-5 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by role, company, location, or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {searchQuery && (
            <button type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hit-area"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Min Score Slider with clean pill */}
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <Sliders className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Min Score:</span>
            <input
              type="range"
              aria-label="Minimum match score"
              min="0"
              max="90"
              step="5"
              value={minScoreFilter}
              onChange={(e) => setMinScoreFilter(Number(e.target.value))}
              className="w-20 md:w-28 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 w-8">
              {minScoreFilter}%
            </span>
          </div>

          {/* Decision Filter */}
          <select
            aria-label="Filter by AI decision"
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
          >
            <option value="ALL">All Decisions</option>
            <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL (&ge;75%)</option>
            <option value="SAVE">SAVE (60-74%)</option>
            <option value="AUTO_APPLY">AUTO_APPLY (&ge;90%)</option>
            <option value="REJECT">REJECT (&lt;60%)</option>
          </select>

          {/* Sort Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <select
              aria-label="Sort matches"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold text-slate-800 dark:text-white focus:ring-0 outline-none cursor-pointer"
            >
              <option value="score_desc">Highest Match</option>
              <option value="score_asc">Lowest Match</option>
              <option value="skills">Best Skill Fit</option>
              <option value="semantic">Best Semantic Fit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Quick threshold presets */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
        <span className="text-slate-400 font-medium">Quick Score Presets:</span>
        {[
          { label: 'All Matches (0%+)', val: 0 },
          { label: 'Moderate Fit (50%+)', val: 50 },
          { label: 'Strong Matches (60%+)', val: 60 },
          { label: 'High Priority (70%+)', val: 70 },
        ].map((preset) => (
          <button type="button"
            key={preset.val}
            onClick={() => setMinScoreFilter(preset.val)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              minScoreFilter === preset.val
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">
          Showing{' '}
          <span className="font-bold text-slate-700 dark:text-slate-200">{filteredAndSortedMatches.length}</span> of{' '}
          {allMatches.length} positions
        </span>
      </div>
    </div>
  </>
);
