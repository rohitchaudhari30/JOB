import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Terminal, Sparkles, Search, Rocket, AlertTriangle, ArrowDown, Maximize2, Columns, X, Activity } from 'lucide-react';
import { TimelineEvent, AutomationRunStatus } from '../types';
import { EventFilter } from './telemetry/parseEventData';
import { ExecutionHud } from './telemetry/ExecutionHud';
import { TelemetryEventCard } from './telemetry/TelemetryEventCard';

interface LiveTelemetryPanelProps {
  events: TimelineEvent[];
  activeRun: AutomationRunStatus | null;
  currentExecutionState: string;
  onOpenOtpModal?: () => void;
  onNavigate?: (tab: string) => void;
  viewMode?: 'split' | 'expanded';
  onToggleViewMode?: () => void;
}


export const LiveTelemetryPanel: React.FC<LiveTelemetryPanelProps> = ({
  events,
  activeRun,
  currentExecutionState,
  onOpenOtpModal,
  onNavigate,
  viewMode = 'split',
  onToggleViewMode,
}) => {
  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  const toggleCard = (idx: number) => {
    setExpandedCards((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Categorized counts for tabs
  const counts = useMemo(() => {
    let applied = 0;
    let matches = 0;
    let discovery = 0;
    let alerts = 0;

    events.forEach((evt) => {
      const name = evt.event_name.toUpperCase();
      if (name.includes('SUBMITTED') || name.includes('APPLYING')) applied++;
      else if (name.includes('EVALUATED') || name.includes('MATCH')) matches++;
      else if (name.includes('DISCOVERY')) discovery++;
      else if (name.includes('PAUSED') || name.includes('CHALLENGE') || name.includes('FAILED')) alerts++;
    });

    return { all: events.length, applied, matches, discovery, alerts };
  }, [events]);

  // Filtered event list
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const name = evt.event_name.toUpperCase();
      const matchesSearch = searchQuery
        ? evt.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          evt.event_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          evt.payload?.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          evt.payload?.job_title?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      if (!matchesSearch) return false;

      switch (activeFilter) {
        case 'applied':
          return name.includes('SUBMITTED') || name.includes('APPLYING');
        case 'matches':
          return name.includes('EVALUATED') || name.includes('MATCH');
        case 'discovery':
          return name.includes('DISCOVERY');
        case 'alerts':
          return name.includes('PAUSED') || name.includes('CHALLENGE') || name.includes('FAILED');
        case 'all':
        default:
          return true;
      }
    });
  }, [events, activeFilter, searchQuery]);

  // Handle auto-scrolling
  useEffect(() => {
    if (autoScroll && bottomAnchorRef.current) {
      bottomAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShowScrollBottomBtn(!isAtBottom);
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const isRunning = activeRun?.status === 'RUNNING';

  return (
    <div className="relative flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Terminal className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="font-bold text-xs text-slate-800 dark:text-white truncate">
            Telemetry &amp; Audit Events
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold shrink-0">
            {events.length} events
          </span>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Search Toggle Icon */}
          <button aria-label="Search"
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="Search events"
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              isSearchOpen || searchQuery
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Auto-Scroll Toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer flex items-center space-x-1.5 ${
              autoScroll
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300'
                : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-100'
            }`}
            title="Toggle automatic pinning to newest event"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}</span>
          </button>

          {/* View Mode Toggle */}
          {onToggleViewMode && (
            <button
              type="button"
              onClick={onToggleViewMode}
              title={viewMode === 'split' ? 'Expand Viewport to Full Width' : 'Restore Split View'}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {viewMode === 'split' ? <Maximize2 className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Active Execution HUD (Pulsing Live State) */}
      {isRunning && <ExecutionHud activeRun={activeRun} currentExecutionState={currentExecutionState} />}

      {/* 3. Filter Segment Tabs */}
      <div className="px-3 py-2 bg-slate-50/70 dark:bg-slate-950/70 border-b border-slate-200/70 dark:border-slate-800/70 shrink-0 space-y-2">
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            All ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('matches')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
              activeFilter === 'matches'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Matches ({counts.matches})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('applied')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
              activeFilter === 'applied'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Rocket className="w-3 h-3" />
            <span>Applied ({counts.applied})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('discovery')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
              activeFilter === 'discovery'
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="w-3 h-3" />
            <span>Scanned ({counts.discovery})</span>
          </button>

          {counts.alerts > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('alerts')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center space-x-1 ${
                activeFilter === 'alerts'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Alerts ({counts.alerts})</span>
            </button>
          )}
        </div>

        {/* Expandable Search Input Row */}
        {(isSearchOpen || searchQuery) && (
          <div className="relative animate-fadeIn">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by job title, company, or skill..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
            {searchQuery && (
              <button aria-label="Close"
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. Stream of Clean, Organized Cards */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-2.5"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-center py-20 text-slate-400 dark:text-slate-600 text-xs space-y-2">
            <Activity className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700 animate-pulse" />
            <p className="font-semibold text-slate-600 dark:text-slate-300">
              {events.length === 0
                ? 'Awaiting telemetry events from orchestrator...'
                : 'No events match the selected filter.'}
            </p>
            <p className="text-[11px] text-slate-400">
              Trigger a discovery or auto-apply campaign to stream real-time logs here.
            </p>
          </div>
        ) : (
          filteredEvents.map((evt, idx) => (
            <TelemetryEventCard
              key={idx}
              evt={evt}
              idx={idx}
              isExpanded={Boolean(expandedCards[idx])}
              onToggle={() => toggleCard(idx)}
              onOpenOtpModal={onOpenOtpModal}
              onNavigate={onNavigate}
            />
          ))
        )}
        <div ref={bottomAnchorRef} />
      </div>

      {/* 5. Centered Bottom Floating "Jump to Latest" Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-slate-900/95 dark:bg-indigo-600 text-white shadow-xl backdrop-blur-md flex items-center space-x-1.5 text-xs font-bold hover:scale-105 transition-all cursor-pointer z-30 border border-white/20"
        >
          <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
          <span>Jump to Latest</span>
        </button>
      )}
    </div>
  );
};
