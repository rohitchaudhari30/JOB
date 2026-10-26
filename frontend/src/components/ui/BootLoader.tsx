import React from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { BRAND_NAME, BRAND_SUFFIX } from '../../utils/brand';

/**
 * Enterprise-grade boot screen loader for session restoration and initial mount.
 * Replaces unstyled "Loading…" text with a subtle, brand-aligned pulse.
 */
export const BootLoader: React.FC = () => (
  <div
    role="status"
    aria-label="Initializing workspace"
    className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 select-none transition-colors duration-300"
  >
    <div className="relative flex flex-col items-center space-y-5">
      {/* Ambient Radial Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-indigo-500/15 rounded-full blur-xl animate-pulse pointer-events-none" />

      {/* Brand Icon with Border Ring */}
      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 dark:from-indigo-500 dark:to-purple-600 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
        <div className="h-full w-full rounded-[14px] bg-indigo-600 dark:bg-slate-900 flex items-center justify-center text-white">
          <Bot className="h-7 w-7 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-400 dark:bg-amber-500 flex items-center justify-center text-slate-950 shadow-xs">
          <Sparkles className="h-3 w-3 fill-slate-950 text-slate-950" />
        </div>
      </div>

      {/* Brand Name Typography */}
      <div className="flex items-center space-x-0.5 text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
        <span>{BRAND_NAME}</span>
        <span className="text-indigo-600 dark:text-indigo-400">{BRAND_SUFFIX}</span>
      </div>

      {/* Micro-Progress Bar Runner */}
      <div className="w-24 h-0.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
        <div className="h-full w-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-shimmer origin-left" />
      </div>
    </div>
  </div>
);
