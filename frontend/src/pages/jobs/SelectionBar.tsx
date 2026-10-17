import React from "react";
import { Play, FileText } from "lucide-react";
import type { Resume } from "../../types";

interface SelectionBarProps {
  defaultResume: Resume | undefined;
  handleLaunchQueue: () => void | Promise<void>;
  isStartingQueue: boolean;
  selectedCount: number;
  setSelectedJobIds: (s: Set<string>) => void;
}

/** Floating bar shown while jobs are selected. */
export const SelectionBar: React.FC<SelectionBarProps> = ({
  defaultResume,
  handleLaunchQueue,
  isStartingQueue,
  selectedCount,
  setSelectedJobIds,
}) => (
  <>
    {/* Floating Action Bar when jobs are selected */}
    {selectedCount > 0 && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slideUp">
        <div className="px-5 py-3 rounded-2xl bg-slate-900/95 text-white border border-indigo-500/40 shadow-2xl backdrop-blur-md flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </span>
            <span className="text-xs font-bold">
              {selectedCount} Job{selectedCount > 1 ? "s" : ""} Queued
            </span>
          </div>

          {defaultResume && (
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700">
              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span
                className="truncate max-w-[130px] font-medium"
                title={defaultResume.file_name}
              >
                {defaultResume.file_name}
              </span>
            </div>
          )}

          <div className="h-4 w-px bg-slate-700" />

          <button
            onClick={() => setSelectedJobIds(new Set())}
            className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Clear
          </button>

          <button
            onClick={() => handleLaunchQueue()}
            disabled={isStartingQueue}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black text-xs shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>
              {isStartingQueue
                ? "Launching Engine..."
                : `🚀 Start Live Auto-Apply (${selectedCount})`}
            </span>
          </button>
        </div>
      </div>
    )}
  </>
);
