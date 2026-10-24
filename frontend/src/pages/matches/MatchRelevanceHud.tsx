import React from 'react';
import { Sparkles, Check, Info } from 'lucide-react';

interface Props {
  score: number;
  verdictText: string;
  ringColor: string;
}

export const MatchRelevanceHud: React.FC<Props> = ({ score, verdictText, ringColor }) => {
  const glowShadow =
    score >= 75
      ? 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.7))'
      : score >= 50
      ? 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.7))'
      : 'drop-shadow(0 0 6px rgba(244, 63, 94, 0.7))';

  return (
    <div className="w-full md:w-52 shrink-0 bg-gradient-to-b from-[#0b1120] via-[#070b16] to-[#04060c] text-white p-5 flex flex-col items-center justify-center text-center border-t md:border-t-0 md:border-l border-white/10 select-none relative overflow-hidden">
      {/* Subtle ambient colored glow */}
      <div
        className={`absolute w-24 h-24 rounded-full blur-2xl opacity-25 pointer-events-none -top-2 ${
          score >= 75 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-rose-500'
        }`}
      />

      {/* Header with Info Icon */}
      <div className="text-[10px] font-extrabold tracking-[0.14em] text-slate-400 uppercase flex items-center gap-1.5 mb-1.5 relative z-10">
        <span>PROFILE RELEVANCE</span>
        <span
          title="Multidimensional score calculated from skill match, experience alignment, and semantic relevance"
          className="cursor-help inline-flex"
        >
          <Info className="w-3 h-3 text-slate-500 hover:text-slate-300 transition-colors" />
        </span>
      </div>

      {/* High-Definition Circular Progress Gauge with Prominent Percentage */}
      <div className="relative w-20 h-20 flex items-center justify-center my-1 select-none z-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className="text-slate-800/90"
            strokeWidth="3.2"
            stroke="currentColor"
            fill="none"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            className={`${ringColor} transition-all duration-500`}
            strokeWidth="3.5"
            strokeDasharray={`${score}, 100`}
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            style={{ filter: glowShadow }}
          />
        </svg>

        {/* Large, High-Contrast Percentage Typography */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-baseline justify-center">
            <span className="text-2xl font-black text-white tracking-tight leading-none drop-shadow-sm font-sans">
              {score}
            </span>
            <span className="text-xs font-extrabold text-slate-300 ml-0.5 leading-none">
              %
            </span>
          </div>
        </div>
      </div>

      {/* Match Verdict */}
      <div className="text-xs font-black tracking-wider text-white mt-1 uppercase relative z-10 drop-shadow-xs">
        {verdictText}
      </div>

      {/* Polished Contextual Highlight Pill Badge */}
      <div className="mt-2.5 relative z-10">
        {score >= 80 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 text-amber-300 shadow-xs">
            <Sparkles className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
            <span>Top 1% for you</span>
          </span>
        ) : score >= 65 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/20 text-emerald-300 shadow-xs">
            <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span>High Priority</span>
          </span>
        ) : score >= 50 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300/90 shadow-xs">
            <span>Potential Fit</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-700 bg-slate-800/80 text-slate-400">
            <span>Needs Review</span>
          </span>
        )}
      </div>
    </div>
  );
};
