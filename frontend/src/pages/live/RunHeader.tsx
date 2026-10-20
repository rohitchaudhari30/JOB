import React from 'react';
import { Pause, RotateCcw, Square, Activity, Compass, Rocket, Layers, Maximize2, Columns } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface Props {
  isRunning: boolean;
  isPaused: boolean;
  isStarting: boolean;
  viewMode: 'split' | 'expanded';
  setViewMode: (mode: 'split' | 'expanded') => void;
  handleStartProfileRun: () => void;
  handlePause: () => void;
  handleResume: () => void;
  handleStop: () => void;
  onNavigate: ((tab: any) => void) | undefined;
}

export const RunHeader: React.FC<Props> = ({
  isRunning,
  isPaused,
  isStarting,
  viewMode,
  setViewMode,
  handleStartProfileRun,
  handlePause,
  handleResume,
  handleStop,
  onNavigate,
}) => (
  <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-sm">
    <div className="flex items-center space-x-3.5">
      <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/60 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
        <Activity className="w-6 h-6 animate-pulse" />
      </div>
      <div>
        <div className="flex items-center space-x-2.5">
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
            Live Automation Mission Control
          </h1>
          {isRunning ? (
            <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>SESSION ACTIVE</span>
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              STANDBY
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Autonomous browser interaction engine, DOM form automation, and real-time telemetry
        </p>
      </div>
    </div>

    {/* Dynamic Controls based on run state & View Mode */}
    <div className="flex flex-wrap items-center gap-3">
      {/* Industry Standard View Mode Segmented Switch */}
      <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shadow-2xs">
        <button
          type="button"
          onClick={() => setViewMode('split')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            viewMode === 'split'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          title="Split View (Side-by-side Viewport + Live Telemetry Logs)"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Split View</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('expanded')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            viewMode === 'expanded'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          title="Full Width Viewport (Expanded Focus Mode)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Full Viewport</span>
        </button>
      </div>

      {isRunning ? (
        <div className="flex items-center space-x-2">
          {isPaused ? (
            <button type="button"
              onClick={handleResume}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resume run</span>
            </button>
          ) : (
            <button type="button"
              onClick={handlePause}
              className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
            >
              <Pause className="w-4 h-4" aria-hidden="true" />
              <span>Pause run</span>
            </button>
          )}

          <button type="button"
            onClick={handleStop}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
          >
            <Square className="w-3.5 h-3.5 fill-white" />
            <span>Stop run</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {/* In-UI Streaming Status Badge */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Layers className="w-3.5 h-3.5" />
            <span>Live Viewport (In-UI Stream)</span>
          </div>

          {/* Option to navigate to Job Discovery to select specific jobs */}
          {onNavigate && (
            <button type="button"
              onClick={() => onNavigate('discovery')}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
            >
              <Compass className="w-4 h-4 text-indigo-500" />
              <span>Curate Jobs in Discovery</span>
            </button>
          )}

          {/* 1-Click Profile Autopilot */}
          <Button variant="primary" size="sm"
            onClick={handleStartProfileRun}
            disabled={isStarting}>
            <Rocket className="w-3.5 h-3.5" />
            <span>{isStarting ? 'Starting Engine...' : 'Run Profile Autopilot'}</span>
          </Button>
        </div>
      )}
    </div>
  </div>
);
