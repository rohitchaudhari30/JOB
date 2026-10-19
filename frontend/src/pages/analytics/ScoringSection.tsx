import React from 'react';
import { Sparkles, ArrowUpRight, Cpu, Info } from 'lucide-react';
import type { WeightTuningRecommendation } from '../../types';

interface Props {
  weightTuning: WeightTuningRecommendation | null;
  aiStatus: any;
  onNavigate: ((tab: any) => void) | undefined;
}

export const ScoringSection: React.FC<Props> = ({ weightTuning, aiStatus, onNavigate }) => (
  <>
    {/* 7. AI Matching Strategy & Optimization (STRICTLY READ-ONLY) */}
    <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>AI Matching Strategy &amp; Optimization</span>
          </h2>
          <p className="text-xs text-slate-500">
            Autonomous cascade routing status and strategic weight recommendations.
          </p>
        </div>

        {/* AI Routing Provider Badge */}
        {aiStatus && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500">Active Routing:</span>
            <strong className="font-mono text-indigo-600 dark:text-indigo-400 uppercase">
              {aiStatus.active_routing}
            </strong>
          </div>
        )}
      </div>

      {/* Read-Only AI Strategic Insight Box */}
      <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/40 space-y-2">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>AI Strategy Insight</span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          {weightTuning?.rationale ||
            'Semantic similarity is associated with higher interview conversion in the selected period. Structured skill overlap ensures base hard-filtering pass rate.'}
        </p>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          Recommendation: Consider increasing semantic similarity weight in Campaign or Matching Settings.
        </div>
      </div>

      {/* Weights Comparison Bars (Read-Only) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Skill Weight */}
        <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300">Structured Skill Overlap</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
              {((weightTuning?.recommended_skill_weight || 0.45) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(weightTuning?.recommended_skill_weight || 0.45) * 100}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400">
            Current: {((weightTuning?.current_skill_weight || 0.4) * 100).toFixed(0)}%
          </div>
        </div>

        {/* Semantic Weight */}
        <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300">Semantic Embedding</span>
            <span className="text-purple-600 dark:text-purple-400 font-mono font-bold">
              {((weightTuning?.recommended_semantic_weight || 0.35) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-purple-600 dark:bg-purple-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(weightTuning?.recommended_semantic_weight || 0.35) * 100}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400">
            Current: {((weightTuning?.current_semantic_weight || 0.35) * 100).toFixed(0)}%
          </div>
        </div>

        {/* Experience Weight */}
        <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300">Experience Band</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
              {((weightTuning?.recommended_experience_weight || 0.2) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${(weightTuning?.recommended_experience_weight || 0.2) * 100}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400">
            Current: {((weightTuning?.current_experience_weight || 0.25) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Read-Only Action: Navigation to Matching Strategy / Settings */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>
            Recommendation Confidence: <strong>{((weightTuning?.confidence_score || 0.9) * 100).toFixed(0)}%</strong>
          </span>
        </div>

        <button type="button"
          onClick={() => onNavigate?.('matches')}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>Configure Matching Strategy</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  </>
);
