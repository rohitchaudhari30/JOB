import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Flame } from 'lucide-react';
import type { SkillDemandInsight } from '../../types';

interface Props {
  skills: SkillDemandInsight[];
}

export const SkillsSection: React.FC<Props> = ({ skills }) => (
  <>
    {/* 6. Market Skill Demand & Candidate Gap Analysis */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span>Market Skill Demand &amp; Candidate Gap Analysis</span>
          </h2>
          <p className="text-xs text-slate-500">
            Aggregated skill requirements discovered across target jobs vs. candidate profile strengths.
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono">Market Matrix</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {skills.length === 0 ? (
          <EmptyState className="col-span-3">
            Discover jobs and run cascade evaluations to populate skill demand analysis.
          </EmptyState>
        ) : (
          skills.map((sk) => (
            <div
              key={sk.skill_name}
              className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs"
            >
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-900 dark:text-white">{sk.skill_name}</span>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    ✓ {sk.matched_frequency} match
                  </span>
                  {sk.missing_frequency > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-mono">✕ {sk.missing_frequency} gap</span>
                  )}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-transparent font-mono">
                Demand {sk.market_demand_score}/10
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  </>
);
