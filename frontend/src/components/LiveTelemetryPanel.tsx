import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Terminal,
  Sparkles,
  Search,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Maximize2,
  Columns,
  Building,
  MapPin,
  Check,
  X,
  Activity,
} from 'lucide-react';
import { TimelineEvent, AutomationRunStatus } from '../types';

interface LiveTelemetryPanelProps {
  events: TimelineEvent[];
  activeRun: AutomationRunStatus | null;
  currentExecutionState: string;
  onOpenOtpModal?: () => void;
  onNavigate?: (tab: string) => void;
  viewMode?: 'split' | 'expanded';
  onToggleViewMode?: () => void;
}

type EventFilter = 'all' | 'applied' | 'matches' | 'discovery' | 'alerts';

/**
 * Deduplicates repeated substrings often scraped from job listing cards
 * e.g. "Python Lead (AWS) Python Lead (AWS)" -> "Python Lead (AWS)"
 */
function cleanJobTitle(raw: string): string {
  if (!raw) return 'Role';
  let title = raw.trim();
  const halfLen = Math.floor(title.length / 2);
  for (let len = halfLen; len >= 6; len--) {
    const firstHalf = title.slice(0, len).trim();
    const secondHalf = title.slice(len).trim();
    if (secondHalf.startsWith(firstHalf)) {
      title = firstHalf;
      break;
    }
  }
  return title;
}

interface ParsedEventData {
  jobTitle?: string;
  company?: string;
  location?: string;
  score?: number;
  decision?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  platform?: string;
  reasoning?: string;
  applicationId?: string;
}

function parseEventData(evt: TimelineEvent): ParsedEventData {
  const payload = evt.payload || {};
  let jobTitle = payload.job_title;
  let company = payload.company;
  let score = payload.score;
  let decision = payload.decision;
  let location = payload.location;
  let matchedSkills = payload.matched_skills;
  let missingSkills = payload.missing_skills;
  let platform = payload.platform;
  let reasoning = payload.reasoning;
  let applicationId = payload.application_id;

  // Fallback regex parsing on raw message if payload is partial
  if ((!jobTitle || !company) && evt.message) {
    const evalMatch = evt.message.match(/Evaluated \[(.+?) at (.+?)\]: Score ([\d.]+)% -> (\w+)/i);
    if (evalMatch) {
      jobTitle = jobTitle || evalMatch[1];
      company = company || evalMatch[2];
      score = score !== undefined ? score : parseFloat(evalMatch[3]);
      decision = decision || evalMatch[4];
    } else {
      const applyMatch = evt.message.match(/Auto-applying to \[(.+?) at (.+?)\]/i);
      if (applyMatch) {
        jobTitle = jobTitle || applyMatch[1];
        company = company || applyMatch[2];
      } else {
        const submitMatch = evt.message.match(/Application submitted successfully for \[(.+?) at (.+?)\]/i);
        if (submitMatch) {
          jobTitle = jobTitle || submitMatch[1];
          company = company || submitMatch[2];
        }
      }
    }
  }

  return {
    jobTitle: jobTitle ? cleanJobTitle(jobTitle) : undefined,
    company: company?.trim(),
    location: location?.trim(),
    score: typeof score === 'number' ? score : undefined,
    decision: decision?.toUpperCase(),
    matchedSkills: Array.isArray(matchedSkills) ? matchedSkills : undefined,
    missingSkills: Array.isArray(missingSkills) ? missingSkills : undefined,
    platform: platform || (evt.message?.toLowerCase().includes('naukri') ? 'naukri' : evt.message?.toLowerCase().includes('linkedin') ? 'linkedin' : undefined),
    reasoning,
    applicationId,
  };
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
      {isRunning && (
        <div className="p-3 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Live Automation Active
              </span>
            </div>

            <span className="px-2 py-0.5 rounded-md bg-white/90 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {activeRun?.active_state || currentExecutionState}
            </span>
          </div>

          {activeRun?.current_job_title && (
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-900/90 px-2.5 py-1 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
              <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
              <span className="text-[10px] text-slate-400 shrink-0">Active Target:</span>
              <span className="font-bold truncate text-indigo-950 dark:text-indigo-200">
                {cleanJobTitle(activeRun.current_job_title)}
              </span>
            </div>
          )}

          {/* 5-Stage Stepper */}
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {[
              { id: 'DISCOVERING', label: '1. Discover' },
              { id: 'MATCHING', label: '2. AI Match' },
              { id: 'NAVIGATING', label: '3. Navigate' },
              { id: 'APPLYING', label: '4. Form Fill' },
              { id: 'SUBMITTED', label: '5. Submitted' },
            ].map((step, idx) => {
              const state = activeRun?.active_state || currentExecutionState;
              let isCurrent = false;
              let isPassed = false;

              if (step.id === 'DISCOVERING') {
                isCurrent = state === 'DISCOVERING';
                isPassed = state === 'MATCHING' || state === 'APPLYING' || state === 'FINISHED' || state === 'COMPLETED';
              } else if (step.id === 'MATCHING') {
                isCurrent = state === 'MATCHING';
                isPassed = state === 'APPLYING' || state === 'FINISHED' || state === 'COMPLETED';
              } else if (step.id === 'NAVIGATING') {
                isCurrent = state === 'APPLYING' && !activeRun?.applications_submitted_count;
                isPassed = Boolean(activeRun?.applications_submitted_count);
              } else if (step.id === 'APPLYING') {
                isCurrent = state === 'APPLYING';
                isPassed = Boolean(activeRun?.applications_submitted_count);
              } else if (step.id === 'SUBMITTED') {
                isCurrent = state === 'FINISHED' || state === 'COMPLETED';
                isPassed = (activeRun?.applications_submitted_count ?? 0) > 0;
              }

              return (
                <div
                  key={idx}
                  className={`text-center py-1 px-1 rounded-md text-[9px] font-bold transition-all ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-2xs animate-pulse'
                      : isPassed
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}
                >
                  {step.label}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          filteredEvents.map((evt, idx) => {
            const data = parseEventData(evt);
            const isMatch = evt.event_name.toUpperCase().includes('EVALUATED');
            const isApply = evt.event_name.toUpperCase().includes('APPLYING');
            const isSubmitted = evt.event_name.toUpperCase().includes('SUBMITTED');
            const isChallenge = evt.event_name.toUpperCase().includes('PAUSED') || evt.event_name.toUpperCase().includes('CHALLENGE');
            const isDiscovery = evt.event_name.toUpperCase().includes('DISCOVERY');
            const isExpanded = Boolean(expandedCards[idx]);

            // CARD 1: AI Evaluation / Match (Clean & Compact)
            if (isMatch) {
              const isAccepted = data.decision === 'AUTO_APPLY' || data.decision === 'REQUIRE_APPROVAL';
              const scoreVal = data.score ?? 0;
              const matched = data.matchedSkills || [];
              const missing = data.missingSkills || [];
              const visibleMatched = isExpanded ? matched : matched.slice(0, 3);
              const visibleMissing = isExpanded ? missing : missing.slice(0, 3);
              const hiddenCount = (matched.length + missing.length) - (visibleMatched.length + visibleMissing.length);

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all shadow-2xs space-y-2 ${
                    isAccepted
                      ? 'bg-emerald-50/40 border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-800/60'
                      : 'bg-white border-slate-200/80 dark:bg-slate-900/90 dark:border-slate-800'
                  }`}
                >
                  {/* Row 1: Header (Platform + Timestamp on Left, Score Badge on Right) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
                        {data.platform || 'PORTAL'}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 shrink-0 ${
                        isAccepted
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {isAccepted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      <span>{scoreVal.toFixed(1)}% {data.decision || 'EVALUATED'}</span>
                    </span>
                  </div>

                  {/* Row 2: Role Title & Company / Location */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {data.jobTitle || 'Role Evaluation'}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {data.company && (
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Building className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[220px]">{data.company}</span>
                        </span>
                      )}
                      {data.location && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{data.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Slim Score Meter */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        scoreVal >= 75
                          ? 'bg-emerald-500'
                          : scoreVal >= 60
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(scoreVal, 100)}%` }}
                    />
                  </div>

                  {/* Row 4: Compact Skills Pills */}
                  {(matched.length > 0 || missing.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {visibleMatched.map((skill, sIdx) => (
                        <span
                          key={`m-${sIdx}`}
                          className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                        >
                          +{skill}
                        </span>
                      ))}
                      {visibleMissing.map((skill, sIdx) => (
                        <span
                          key={`g-${sIdx}`}
                          className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                        >
                          -{skill}
                        </span>
                      ))}
                      {hiddenCount > 0 && !isExpanded && (
                        <button
                          type="button"
                          onClick={() => toggleCard(idx)}
                          className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 cursor-pointer"
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                    </div>
                  )}

                  {/* Row 5: Collapsible Reasoning Details */}
                  {data.reasoning && (
                    <div className="pt-0.5">
                      {!isExpanded ? (
                        <button
                          type="button"
                          onClick={() => toggleCard(idx)}
                          className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Show AI Reasoning</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      ) : (
                        <div className="space-y-1.5 animate-fadeIn">
                          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                            {data.reasoning}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleCard(idx)}
                            className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 cursor-pointer"
                          >
                            <span>Hide Details</span>
                            <ChevronUp className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // CARD 2: Application Submitted / In Progress
            if (isSubmitted || isApply) {
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all shadow-xs space-y-2 ${
                    isSubmitted
                      ? 'bg-gradient-to-r from-emerald-50/70 to-teal-50/40 border-emerald-300 dark:from-emerald-950/40 dark:to-slate-900 dark:border-emerald-800/80'
                      : 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800/60 animate-pulse'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] flex items-center gap-1 ${
                          isSubmitted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isSubmitted ? <CheckCircle2 className="w-3 h-3" /> : <Rocket className="w-3 h-3" />}
                        <span>{isSubmitted ? 'SUBMISSION CONFIRMED' : 'APPLYING NOW'}</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {data.score !== undefined && (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                        Fit Score: {data.score}%
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {data.jobTitle || 'Application Target'}
                    </h4>
                    {data.company && (
                      <div className="flex items-center space-x-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                        <Building className="w-3 h-3 text-slate-400" />
                        <span>{data.company}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {isSubmitted ? 'Application record saved to CRM' : 'Filling candidate profile via browser...'}
                    </span>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('crm')}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View in CRM</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // CARD 3: Challenge Detected
            if (isChallenge) {
              return (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/80 shadow-xs space-y-2 animate-bounce-subtle"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-amber-500 text-white flex items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      <span>CHALLENGE DETECTED</span>
                    </span>
                    <span className="text-amber-700 dark:text-amber-300 font-mono text-[10px]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    {evt.message}
                  </p>

                  {onOpenOtpModal && (
                    <button
                      type="button"
                      onClick={onOpenOtpModal}
                      className="w-full py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      Enter OTP / Resume Automation
                    </button>
                  )}
                </div>
              );
            }

            // CARD 4: Discovery Completed
            if (isDiscovery) {
              return (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-sky-50/60 border border-sky-200 dark:bg-sky-950/20 dark:border-sky-800/60 shadow-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300 flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      <span>DISCOVERY SYNC</span>
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {evt.message}
                  </p>

                  {evt.stats && (
                    <div className="flex items-center space-x-3 text-[10px] text-slate-600 dark:text-slate-400 pt-1 border-t border-sky-100 dark:border-sky-900/40">
                      <span>Found: <strong>{evt.stats.discovered}</strong></span>
                      <span>Matched: <strong>{evt.stats.matched}</strong></span>
                      <span>Applied: <strong>{evt.stats.applied}</strong></span>
                    </div>
                  )}
                </div>
              );
            }

            // Fallback Generic System Event
            return (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800/80 space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-bold border border-slate-300/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    {evt.event_name}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed font-sans">
                  {evt.message}
                </div>
              </div>
            );
          })
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
