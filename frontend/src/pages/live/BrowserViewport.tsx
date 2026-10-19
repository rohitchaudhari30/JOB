import React from 'react';
import { Activity, Sparkles, Lock, Expand, Shrink } from 'lucide-react';
import type { AutomationRunStatus } from '../../types';

interface Props {
  activeRun: AutomationRunStatus | null;
  isRunning: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  viewMode: 'split' | 'expanded';
  currentExecutionState: string;
  liveUrl: string;
  hasReceivedFrame: boolean;
  sourceType: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  viewportContainerRef: React.RefObject<HTMLDivElement>;
}

export const BrowserViewport: React.FC<Props> = ({
  activeRun,
  isRunning,
  isFullscreen,
  toggleFullscreen,
  viewMode,
  currentExecutionState,
  liveUrl,
  hasReceivedFrame,
  sourceType,
  canvasRef,
  viewportContainerRef,
}) => (
  <div
    ref={viewportContainerRef}
    className={`${
      isFullscreen
        ? 'fixed inset-0 z-50 rounded-none bg-slate-950 flex flex-col p-4 w-screen h-screen'
        : viewMode === 'expanded'
          ? 'col-span-12 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-all'
          : 'lg:col-span-7 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-all'
    }`}
  >
    {/* Browser Chrome Header */}
    <div className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center space-x-2 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 pl-1.5 hidden sm:inline">
          Browser Viewport
        </span>
      </div>

      {/* URL Address Bar */}
      <div className="flex-1 max-w-sm px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate shadow-2xs">
        <Lock className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="truncate">{liveUrl || `https://www.${sourceType.toLowerCase()}.com/jobs`}</span>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {/* Active Stage Indicator Badge in Chrome Header */}
        {isRunning && (currentExecutionState === 'DISCOVERING' || activeRun?.active_state === 'DISCOVERING') && (
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 animate-in fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Stage 1: Job Discovery</span>
          </span>
        )}
        {isRunning && (currentExecutionState === 'MATCHING' || activeRun?.active_state === 'MATCHING') && (
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30 animate-in fade-in">
            <Sparkles className="w-3 h-3 text-indigo-500 animate-spin" />
            <span>Stage 2: AI Matching Active</span>
          </span>
        )}
        {isRunning && (currentExecutionState === 'APPLYING' || activeRun?.active_state === 'APPLYING') && (
          <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30 animate-in fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
            <span>Stage 3: Submitting Application</span>
          </span>
        )}

        {isRunning && (
          <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden md:inline">⚡ LIVE IN-UI STREAM</span>
            <span className="md:hidden">⚡ LIVE</span>
          </span>
        )}
        <span className="text-[10px] text-slate-400 font-mono hidden xl:inline">1280×800</span>

        {/* Viewport Sizing & Presentation Action Controls */}
        <div className="flex items-center space-x-1 pl-2 border-l border-slate-200 dark:border-slate-800">
          {/* Native Fullscreen Mode Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen Mode'}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Shrink className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Expand className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
            )}
          </button>
        </div>
      </div>
    </div>

    {/* Viewport Canvas with exact 16:10 aspect ratio or fullscreen flex */}
    <div
      className={`${isFullscreen ? 'flex-1 w-full' : 'aspect-[16/10] w-full'} bg-slate-100 dark:bg-slate-950 flex items-center justify-center relative overflow-hidden`}
    >
      <canvas ref={canvasRef} width={1280} height={800} className="w-full h-full object-contain" />
      {!hasReceivedFrame && (
        <div className="absolute inset-0 bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur-xs flex items-center justify-center text-center p-8 z-10 pointer-events-none">
          <div className="space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-xs">
              <Activity className="w-7 h-7 animate-pulse" />
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {isRunning ? 'Connecting Live Browser Stream...' : 'Live Browser Viewport Ready'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              {isRunning
                ? 'Real-time visual stream active. Capturing field inputs, page scrolling, and application submissions.'
                : 'Launch Profile Autopilot or start a discovery run to stream real-time browser actions.'}
            </p>
          </div>
        </div>
      )}
    </div>
  </div>
);
