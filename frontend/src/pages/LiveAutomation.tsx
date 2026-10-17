import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  RotateCcw,
  Square,
  Terminal,
  Activity,
  Compass,
  Rocket,
  CheckCircle2,
  Sparkles,
  Lock,
  Layers,
  Maximize2,
  Columns,
  Expand,
  Shrink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { AutomationRunStatus, TimelineEvent } from '../types';
import { useToast } from '../context/ToastContext';
import { LiveTelemetryPanel } from '../components/LiveTelemetryPanel';

interface LiveAutomationProps {
  activeRun: AutomationRunStatus | null;
  onRefreshStatus: () => void;
  onNavigate?: (tab: any) => void;
}

export const LiveAutomation: React.FC<LiveAutomationProps> = ({
  activeRun,
  onRefreshStatus,
  onNavigate,
}) => {
  const { showError, showSuccess } = useToast();
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [sourceType] = useState('naukri');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // Clear legacy desktop window toggle to ensure pure in-UI streaming
    localStorage.removeItem('show_desktop_browser');
  }, []);

  // Rehydrate historical timeline events on mount or when activeRun changes
  useEffect(() => {
    if (!activeRun?.run_id) return;
    let isCancelled = false;

    api.getRunEvents(activeRun.run_id)
      .then((historicalEvents) => {
        if (!isCancelled && Array.isArray(historicalEvents) && historicalEvents.length > 0) {
          setTimelineEvents((prev) => {
            if (prev.length === 0) return historicalEvents;
            const getEventKey = (e: TimelineEvent) => e.id || `${e.timestamp}_${e.event_name}_${e.seq || ''}`;
            const existingKeys = new Set(prev.map(getEventKey));
            const freshHistory = historicalEvents.filter((e) => !existingKeys.has(getEventKey(e)));
            return [...freshHistory, ...prev];
          });
        }
      })
      .catch((err) => {
        console.warn('Could not rehydrate historical events for run:', activeRun.run_id, err);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeRun?.run_id]);

  const [completedSummary, setCompletedSummary] = useState<{
    discovered: number;
    matched: number;
    applied: number;
    message: string;
  } | null>(null);
  const [currentExecutionState, setCurrentExecutionState] = useState<string>('IDLE');

  const [liveUrl, setLiveUrl] = useState<string>('');
  const [hasReceivedFrame, setHasReceivedFrame] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  // Industry-Standard Viewport Presentation Controls (Split vs Full Width vs Fullscreen)
  const [viewMode, setViewMode] = useState<'split' | 'expanded'>('split');
  const [showTelemetryInExpanded, setShowTelemetryInExpanded] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = async () => {
    if (!viewportContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await viewportContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    // 1. High-Performance Native CDP Binary Frame Listener (ImageBitmap + Hardware Canvas)
    const unsubscribeBinary = wsClient.onBinaryFrame(async (blobOrBuffer) => {
      try {
        const blob = blobOrBuffer instanceof Blob ? blobOrBuffer : new Blob([blobOrBuffer], { type: 'image/jpeg' });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if ('createImageBitmap' in window) {
          const bitmap = await createImageBitmap(blob);
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
        } else {
          const objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(objectUrl);
          };
          img.src = objectUrl;
        }
        setHasReceivedFrame(true);
      } catch (err) {
        // Tolerant frame drop
      }
    });

    // 2. Real-time Navigation URL tracking from CDP
    const unsubscribeNav = wsClient.onNavigation((url) => {
      if (url) setLiveUrl(url);
    });

    // 3. Fallback base64 frame listener
    const unsubscribeFrame = wsClient.onFrame((b64, url) => {
      if (url) setLiveUrl(url);
      if (!b64) return;

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth || 1280;
          canvas.height = img.naturalHeight || 800;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasReceivedFrame(true);
      };
      img.src = `data:image/jpeg;base64,${b64}`;
    });

    // 4. Live timeline events
    const unsubscribeEvent = wsClient.onEvent((event) => {
      setTimelineEvents((prev) => {
        const getEventKey = (e: TimelineEvent) => e.id || `${e.timestamp}_${e.event_name}_${e.seq || ''}`;
        const key = getEventKey(event);
        if (prev.some((e) => getEventKey(e) === key)) {
          return prev;
        }

        // Check for sequence gap if monotonic seq is present
        const maxSeq = prev.reduce((max, e) => Math.max(max, e.seq || 0), 0);
        if (event.seq && maxSeq > 0 && event.seq > maxSeq + 1 && event.run_id) {
          // Detected sequence gap! Recover missing range asynchronously
          api.getRunEvents(event.run_id, maxSeq)
            .then((missedEvents) => {
              if (Array.isArray(missedEvents) && missedEvents.length > 0) {
                setTimelineEvents((curr) => {
                  const currKeys = new Set(curr.map(getEventKey));
                  const newEvents = missedEvents.filter((m) => !currKeys.has(getEventKey(m)));
                  if (newEvents.length === 0) return curr;
                  const combined = [...curr, ...newEvents];
                  combined.sort((a, b) => (a.seq || 0) - (b.seq || 0));
                  return combined;
                });
              }
            })
            .catch((err) => console.warn('[LiveConsole] Failed to recover sequence gap:', err));
        }

        return [...prev, event];
      });
      if (event.state) {
        setCurrentExecutionState(event.state);
      }
      if (event.event_name === 'PAUSED_FOR_USER' || event.state === 'PAUSED_OTP') {
        setOtpModalOpen(true);
      }
      if (event.event_name === 'RUN_COMPLETED') {
        const stats = event.stats;
        const msg = stats
          ? `🎉 All automation done! Discovered: ${stats.discovered}, Matched: ${stats.matched}, Applied: ${stats.applied}.`
          : event.message || '🎉 All automation done!';
        showSuccess(msg);
        setCompletedSummary({
          discovered: stats?.discovered ?? 0,
          matched: stats?.matched ?? 0,
          applied: stats?.applied ?? 0,
          message: event.message || 'All automation completed successfully!',
        });
        setCurrentExecutionState('COMPLETED');
        onRefreshStatus();
      } else if (
        event.event_name === 'RUN_STARTED' ||
        event.event_name === 'RUN_ABORTED'
      ) {
        onRefreshStatus();
      }
    });

    return () => {
      unsubscribeBinary();
      unsubscribeNav();
      unsubscribeFrame();
      unsubscribeEvent();
    };
  }, []);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [timelineEvents]);

  const handleStartProfileRun = async () => {
    try {
      setIsStarting(true);
      const prof = await api.getProfile().catch(() => null);
      const roles = prof?.headline ? [prof.headline] : ['Software Engineer'];
      const locations = prof?.location ? [prof.location] : ['Bengaluru'];

      const run = await api.startAutomation({
        source_type: sourceType,
        roles,
        locations,
        auto_apply_matches: true,
        max_applications: 10,
        auto_apply_threshold: 80.0,
        headless: true,
      });

      setTimelineEvents([
        {
          run_id: run.run_id,
          event_name: 'RUN_INITIALIZED',
          state: 'INITIALIZING',
          message: `Profile Autopilot started for [${roles.join(', ')}] on [${sourceType.toUpperCase()}] with live in-UI streaming.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      showSuccess(`Profile Autopilot started with live in-UI streaming!`);
      onRefreshStatus();
    } catch (e: any) {
      showError(`Failed to start autopilot: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handlePause = async () => {
    if (!activeRun) return;
    try {
      await api.pauseRun(activeRun.run_id);
      wsClient.sendCommand('PAUSE', activeRun.run_id);
      onRefreshStatus();
    } catch (e: any) {
      console.error('Pause failed:', e);
    }
  };

  const handleResume = async () => {
    if (!activeRun) return;
    try {
      await api.resumeRun(activeRun.run_id, otpValue || undefined);
      wsClient.sendCommand('RESUME', activeRun.run_id, otpValue || undefined);
      setOtpModalOpen(false);
      setOtpValue('');
      onRefreshStatus();
    } catch (e: any) {
      console.error('Resume failed:', e);
    }
  };

  const handleStop = async () => {
    if (!activeRun) return;
    try {
      await api.stopRun(activeRun.run_id);
      wsClient.sendCommand('STOP', activeRun.run_id);
      onRefreshStatus();
    } catch (e: any) {
      console.error('Stop failed:', e);
    }
  };

  const isRunning = Boolean(activeRun && activeRun.status === 'RUNNING');
  const isPaused = Boolean(activeRun && activeRun.is_paused);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Mission Control Status Header - No Duplicate Filters */}
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
                <button
                  onClick={handleResume}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Resume Run</span>
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={handleStop}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop Run</span>
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
                <button
                  onClick={() => onNavigate('discovery')}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
                >
                  <Compass className="w-4 h-4 text-indigo-500" />
                  <span>Curate Jobs in Discovery</span>
                </button>
              )}

              {/* 1-Click Profile Autopilot */}
              <button
                onClick={handleStartProfileRun}
                disabled={isStarting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>{isStarting ? 'Starting Engine...' : 'Run Profile Autopilot'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Run Completion Notification Banner */}
      {completedSummary && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100 flex items-center space-x-2">
                <span>All Automation Tasks Completed!</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200 font-bold">100% DONE</span>
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                {completedSummary.message} — Discovered: <strong>{completedSummary.discovered}</strong> • Matched: <strong>{completedSummary.matched}</strong> • Applied: <strong>{completedSummary.applied}</strong>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('crm')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                View Applications
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCompletedSummary(null);
                setCurrentExecutionState('IDLE');
                onRefreshStatus();
              }}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Dual Stream Grid: Browser Frame Canvas + Realtime Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Frame Canvas */}
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
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 pl-1.5 hidden sm:inline">Browser Viewport</span>
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
          <div className={`${isFullscreen ? 'flex-1 w-full' : 'aspect-[16/10] w-full'} bg-slate-100 dark:bg-slate-950 flex items-center justify-center relative overflow-hidden`}>
            <canvas
              ref={canvasRef}
              width={1280}
              height={800}
              className="w-full h-full object-contain"
            />
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

        {/* Live Timeline & Telemetry in Split View (5 cols) */}
        {viewMode === 'split' && (
          <div className="lg:col-span-5 flex flex-col rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 overflow-hidden shadow-lg h-[560px]">
            <LiveTelemetryPanel
              events={timelineEvents}
              activeRun={activeRun}
              currentExecutionState={currentExecutionState}
              onOpenOtpModal={() => setOtpModalOpen(true)}
              onNavigate={onNavigate}
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode('expanded')}
            />
          </div>
        )}

        {/* Collapsible Full-Width Telemetry in Expanded Mode */}
        {viewMode === 'expanded' && (
          <div className="col-span-12 flex flex-col rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 overflow-hidden shadow-lg transition-all animate-fadeIn">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2 font-bold text-xs text-slate-800 dark:text-white">
                <Terminal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Telemetry &amp; Audit Events</span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {timelineEvents.length} events
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTelemetryInExpanded(!showTelemetryInExpanded)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer flex items-center space-x-1"
                >
                  <span>{showTelemetryInExpanded ? 'Hide Event Stream' : 'Show Event Stream'}</span>
                  {showTelemetryInExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer flex items-center space-x-1 pl-2 border-l border-slate-200 dark:border-slate-700"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Restore Split View</span>
                </button>
              </div>
            </div>

            {showTelemetryInExpanded && (
              <div className="h-[460px]">
                <LiveTelemetryPanel
                  events={timelineEvents}
                  activeRun={activeRun}
                  currentExecutionState={currentExecutionState}
                  onOpenOtpModal={() => setOtpModalOpen(true)}
                  onNavigate={onNavigate}
                  viewMode={viewMode}
                  onToggleViewMode={() => setViewMode('split')}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Challenge / OTP Modal (Human In The Loop) */}
      <Modal
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="Verification challenge detected"
        widthClass="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOtpModalOpen(false)}>
              Dismiss
            </Button>
            <Button variant="primary" onClick={handleResume}>
              Submit code &amp; resume auto-apply
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            The portal needs an OTP or CAPTCHA confirmation. The automation engine has safely paused. Enter the code sent to
            your registered phone/email, or solve the challenge on the portal.
          </p>
          <div>
            <label htmlFor="otp-code" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              OTP code / verification token
            </label>
            <input
              id="otp-code"
              data-autofocus
              type="text"
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white font-mono text-center tracking-widest text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
