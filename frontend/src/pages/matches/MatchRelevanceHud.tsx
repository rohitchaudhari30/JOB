import React from 'react';
import { Sparkles, Check, Info, Briefcase, Award } from 'lucide-react';

export interface MatchRelevanceHudProps {
  score: number;
  verdictText?: string;
  matchedSkillsCount?: number;
  totalSkillsCount?: number;
  experienceText?: string;
  skillScore?: number;
  experienceScore?: number;
}

interface TierConfig {
  label: string;
  badgeLabel: string;
  ringClass: string;
  trackClass: string;
  badgeClass: string;
  accentBg: string;
  icon: React.ReactNode;
}

const getTierConfig = (score: number): TierConfig => {
  if (score >= 80) {
    return {
      label: 'Top Match',
      badgeLabel: 'Top 1% Fit',
      ringClass: 'text-emerald-500 dark:text-emerald-400',
      trackClass: 'stroke-emerald-100/90 dark:stroke-emerald-950/60',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      accentBg: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      icon: <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    };
  }
  if (score >= 65) {
    return {
      label: 'Strong Fit',
      badgeLabel: 'High Priority',
      ringClass: 'text-indigo-600 dark:text-indigo-400',
      trackClass: 'stroke-indigo-100/90 dark:stroke-indigo-950/60',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
      accentBg: 'from-indigo-500/10 via-indigo-500/5 to-transparent',
      icon: <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />,
    };
  }
  if (score >= 50) {
    return {
      label: 'Good Match',
      badgeLabel: 'Potential Fit',
      ringClass: 'text-amber-500 dark:text-amber-400',
      trackClass: 'stroke-amber-100/90 dark:stroke-amber-950/60',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      accentBg: 'from-amber-500/10 via-amber-500/5 to-transparent',
      icon: <Check className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />,
    };
  }
  return {
    label: 'Needs Review',
    badgeLabel: 'Exploratory',
    ringClass: 'text-slate-400 dark:text-slate-500',
    trackClass: 'stroke-slate-200 dark:stroke-slate-800',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    accentBg: 'from-slate-500/5 to-transparent',
    icon: null,
  };
};

export const MatchRelevanceHud: React.FC<MatchRelevanceHudProps> = ({
  score,
  verdictText,
  matchedSkillsCount,
  totalSkillsCount,
  experienceText,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const tier = getTierConfig(clampedScore);
  const displayLabel = verdictText || tier.label;

  const hasSkillData = totalSkillsCount !== undefined && totalSkillsCount > 0;
  const hasExpData = Boolean(experienceText && experienceText.trim());

  return (
    <div
      aria-label={`Match score: ${clampedScore} percent, ${displayLabel}`}
      className="w-full md:w-60 lg:w-64 shrink-0 bg-slate-50/70 dark:bg-slate-900/60 border-t md:border-t-0 md:border-l border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex flex-col items-center justify-between text-center select-none relative overflow-hidden transition-colors"
    >
      {/* Subtle contextual ambient gradient at top */}
      <div
        className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${tier.accentBg} pointer-events-none transition-all duration-500`}
      />

      {/* Top Header Label with Tooltip */}
      <div className="w-full flex items-center justify-between text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase relative z-10">
        <span className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <span>Match Score</span>
        </span>
        <span
          title="Calculated from your skills match, experience alignment, and role requirements"
          className="cursor-help inline-flex text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Modern Circular Progress Gauge */}
      <div className="relative w-20 h-20 my-2 flex items-center justify-center select-none z-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          {/* Subtle background track */}
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className={tier.trackClass}
            strokeWidth="3.2"
            fill="none"
          />
          {/* Animated progress ring */}
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className={`${tier.ringClass} transition-all duration-700 ease-out`}
            strokeWidth="3.4"
            strokeDasharray={`${clampedScore}, 100`}
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex items-baseline justify-center">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none font-sans">
              {clampedScore}
            </span>
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 ml-0.5 leading-none">
              %
            </span>
          </div>
        </div>
      </div>

      {/* Unified Tier Status Badge */}
      <div className="relative z-10 mb-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border shadow-2xs ${tier.badgeClass}`}
        >
          {tier.icon}
          <span>{displayLabel}</span>
        </span>
      </div>

      {/* Explanatory Micro-Metrics (Why this score?) */}
      {(hasSkillData || hasExpData) && (
        <div className="w-full pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-left relative z-10">
          {hasSkillData && (
            <div className="bg-white/90 dark:bg-slate-800/80 rounded-xl px-2.5 py-1.5 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
              <span className="block text-[9px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-400">
                Skills
              </span>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {matchedSkillsCount ?? 0}/{totalSkillsCount}
                </span>
              </span>
            </div>
          )}

          {hasExpData && (
            <div className="bg-white/90 dark:bg-slate-800/80 rounded-xl px-2.5 py-1.5 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
              <span className="block text-[9px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-400">
                Exp Range
              </span>
              <span
                className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5 whitespace-nowrap"
                title={`Experience requirement: ${experienceText}`}
              >
                <Briefcase className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span className="whitespace-nowrap font-black">{experienceText}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
