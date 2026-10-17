import React from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { DashboardOverview } from '../../types';
import { EmptyState } from '../../components/ui/EmptyState';

interface Props {
  overview: DashboardOverview | null;
  onNavigate: (tab: any) => void;
}

export const TopMatchesCard: React.FC<Props> = ({ overview, onNavigate }) => (
  <>
    {/* 5. Top Actionable AI Matches (Immediate Opportunities) */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Top Actionable Job Matches</h2>
            <p className="text-xs text-slate-500">
              High-confidence opportunities discovered and evaluated for your profile.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('matches')}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
        >
          <span>View All Matches</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {overview && overview.top_matches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overview.top_matches.slice(0, 4).map((match) => (
            <div
              key={match.job_id}
              className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:border-indigo-300 dark:bg-slate-800/40 dark:border-slate-700/80 transition-all space-y-3 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">{match.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{match.company}</span>
                    <span>•</span>
                    <span>{match.location}</span>
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-black text-xs border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono shrink-0">
                  {match.match_score.toFixed(0)}% Match
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {match.platform}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigate('matches')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Review in Jobs</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>
          No high-confidence matches found yet. Run discovery or configure your campaign criteria to populate matches.
        </EmptyState>
      )}
    </div>
  </>
);
