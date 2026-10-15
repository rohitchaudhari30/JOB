import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Pause,
  RotateCcw,
  Square,
  KeyRound,
  Terminal,
  Activity,
  X,
  Minimize2,
  Maximize2,
  Layers,
  CheckCircle2,
  Loader2,
  Clock,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { AutomationRunStatus, TimelineEvent, Job } from '../types';
import { useToast } from '../context/ToastContext';

interface LiveConsoleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queuedJobs?: Job[];
  activeRun: AutomationRunStatus | null;
  onRefreshStatus: () => void;
  sourceType?: string;
  activeResumeName?: string;
  onNavigate?: (tab: any) => void;
}

export const LiveConsoleDrawer: React.FC<LiveConsoleDrawerProps> = ({
  isOpen,
  onClose,
  queuedJobs = [],
  activeRun,
  onRefreshStatus,
  sourceType = 'naukri',
  activeResumeName,
  onNavigate,
}) => {
  const { showError, showSuccess } = useToast();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWideView, setIsWideView] = useState(false);
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [activeTab, setActiveTab] = useState<'stream' | 'queue'>('stream');
  const [currentJobIndex, setCurrentJobIndex] = useState(0);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  const playChime = (type: 'alert' | 'success') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'alert') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch {
      // Audio restrictions
    }
  };

  const notifyDesktop = (title: string, body: string) => {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, { body });
          }
        });
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Connect to WebSocket frame stream
    const unsubscribeFrame = wsClient.onFrame((b64) => {
      setFrameBase64(`data:image/jpeg;base64,${b64}`);
    });

    // Connect to live timeline event updates
    const unsubscribeEvent = wsClient.onEvent((event) => {
      setTimelineEvents((prev) => [...prev, event]);

      if (event.event_name === 'PAUSED_FOR_USER' || event.state === 'PAUSED_OTP') {
        setOtpModalOpen(true);
        playChime('alert');
        notifyDesktop('Action Required', 'Application engine paused for user OTP verification.');
      } else if (event.event_name === 'APPLICATION_SUBMITTED') {
        playChime('success');
        setCurrentJobIndex((prev) => prev + 1);
      }

      if (
        event.event_name === 'RUN_COMPLETED' ||
        event.event_name === 'RUN_STARTED' ||
        event.event_name === 'RUN_ABORTED'
      ) {
        onRefreshStatus();
      }
    });

    return () => {
      unsubscribeFrame();
      unsubscribeEvent();
    };
  }, [isOpen]);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timelineEvents]);

  const isRunning = activeRun?.status === 'RUNNING';
  const isPaused = activeRun?.status === 'PAUSED' || activeRun?.is_paused === true;

  const handlePause = async () => {
    if (!activeRun) return;
    try {
      await api.pauseRun(activeRun.run_id);
      wsClient.sendCommand('PAUSE', activeRun.run_id);
      onRefreshStatus();
      showSuccess('Automation paused.');
    } catch (e: any) {
      showError(`Pause failed: ${e.message}`);
    }
  };

  const handleResume = async () => {
    if (!activeRun) return;
    try {
      await api.resumeRun(activeRun.run_id, otpValue.trim() || undefined);
      wsClient.sendCommand('RESUME', activeRun.run_id, otpValue.trim() || undefined);
      setOtpModalOpen(false);
      setOtpValue('');
      onRefreshStatus();
      showSuccess('Automation resumed.');
    } catch (e: any) {
      showError(`Resume failed: ${e.message}`);
    }
  };

  const handleStop = async () => {
    if (!activeRun) return;
    try {
      await api.stopRun(activeRun.run_id);
      wsClient.sendCommand('STOP', activeRun.run_id);
      onRefreshStatus();
      showSuccess('Automation stopped.');
    } catch (e: any) {
      showError(`Stop failed: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  // Minimized Floating PIP Widget
  if (isMinimized) {
    return createPortal(
      <div className="fixed bottom-6 right-6 z-50 animate-bounce-subtle">
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/40 text-slate-800 dark:text-white rounded-2xl p-3.5 shadow-2xl flex items-center space-x-3.5 backdrop-blur-md">
          <div className="relative">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping absolute inset-0"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 relative"></div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <span>Live Automation Running</span>
              <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                {sourceType.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {queuedJobs.length > 0
                ? `Progress: ${Math.min(currentJobIndex + 1, queuedJobs.length)}/${queuedJobs.length} queued`
                : isRunning
                ? 'Applying to target opportunities...'
                : 'Session Ready'}
            </div>
          </div>
          <button aria-label="Expand panel"
            onClick={() => setIsMinimized(false)}
            className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xs cursor-pointer ml-1"
            title="Expand Live Console"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const portalUrlMap: Record<string, string> = {
    naukri: 'https://www.naukri.com/jobs',
    linkedin: 'https://www.linkedin.com/jobs',
    indeed: 'https://www.indeed.com',
    foundit: 'https://www.foundit.in',
  };
  const activePortalUrl = portalUrlMap[sourceType.toLowerCase()] || `https://www.${sourceType.toLowerCase()}.com`;

  return createPortal(
    <>
      {/* Soft translucent backdrop positioned below the sticky navbar */}
      <div
        className="fixed top-16 inset-x-0 bottom-0 z-40 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => setIsMinimized(true)}
      />

      {/* Slide-over Drawer anchored cleanly below the navbar */}
      <div
        className={`fixed top-16 bottom-0 right-0 z-50 w-full ${
          isWideView ? 'sm:w-[720px] lg:w-[860px]' : 'sm:w-[580px] lg:w-[640px]'
        } bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col transform transition-all duration-300 ease-out animate-slideLeft`}
      >
        {/* Drawer Header - Fully visible & prominent below navbar */}
        <div className="p-4 bg-slate-50/95 dark:bg-slate-950 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 shadow-xs">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-700/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs shrink-0">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">
                  Live Automation Console
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shrink-0">
                  {sourceType.toUpperCase()}
                </span>
                {isRunning && (
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>LIVE</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {queuedJobs.length > 0
                  ? `Applying to ${queuedJobs.length} queued job${queuedJobs.length > 1 ? 's' : ''}`
                  : 'Autonomous multi-stage application session'}
                {activeResumeName && ` • Resume: ${activeResumeName}`}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {isRunning && (
              <>
                {isPaused ? (
                  <button
                    onClick={handleResume}
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                    title="Resume Automation"
                  
 aria-label="Resume Automation"
>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Resume</span>
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                    title="Pause Automation"
                  
 aria-label="Pause Automation"
>
                    <Pause className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Pause</span>
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                  title="Stop Automation"
                
 aria-label="Stop Automation"
>
                  <Square className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </>
            )}

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5"></div>

            {/* Toggle Wide view */}
            <button aria-label="Expand panel"
              onClick={() => setIsWideView(!isWideView)}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer hidden sm:block shadow-2xs"
              title={isWideView ? 'Standard Width' : 'Wide Width'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Open full page if onNavigate available */}
            {onNavigate && (
              <button aria-label="Open link"
                onClick={() => {
                  onClose();
                  onNavigate('live_console');
                }}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
                title="Open in Fullscreen Page"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Minimize */}
            <button aria-label="Shrink panel"
              onClick={() => setIsMinimized(true)}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
              title="Minimize to Floating Pill"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
              title="Close Drawer"
            
 aria-label="Close Drawer"
>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Queue Progress Bar (if queue exists) */}
        {queuedJobs.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Queue Progress:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {Math.min(currentJobIndex, queuedJobs.length)} / {queuedJobs.length} Jobs
              </span>
            </div>
            <div className="w-36 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((Math.min(currentJobIndex, queuedJobs.length) / queuedJobs.length) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div className="px-5 pt-3 pb-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'stream'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Stream &amp; Telemetry</span>
          </button>
          {queuedJobs.length > 0 && (
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'queue'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Selected Queue ({queuedJobs.length})</span>
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto flex flex-col p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/40">
          {activeTab === 'stream' ? (
            <>
              {/* Realistic macOS-Style Browser Frame */}
              <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col">
                {/* Browser Window Chrome / URL Bar */}
                <div className="px-3.5 py-2 bg-slate-100/90 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                  </div>

                  {/* Mock URL bar */}
                  <div className="flex-1 max-w-sm mx-auto px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate shadow-2xs">
                    <Lock className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="truncate">{activePortalUrl}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0 text-[10px] font-mono text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>1280×800</span>
                  </div>
                </div>

                {/* Stream Display Canvas - Exact 16:10 aspect ratio matching 1280x800 */}
                <div className="aspect-[16/10] w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center relative overflow-hidden">
                  {frameBase64 ? (
                    <img
                      src={frameBase64}
                      alt="Live Browser Automation Stream"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-6 space-y-2.5">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-slate-900 border border-indigo-100 dark:border-slate-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400 shadow-xs">
                        <Activity className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {isRunning ? 'Connecting to Live Playwright Stream...' : 'Engine Ready'}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                        Browser interactions, form autofill, and screening question responses will stream here in real time.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Telemetry & Actions Log Card */}
              <div className="flex-1 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 overflow-hidden flex flex-col min-h-[200px] shadow-sm">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Terminal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Real-time Telemetry &amp; Actions</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-semibold">
                    {timelineEvents.length} event{timelineEvents.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs max-h-[260px]">
                  {timelineEvents.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs font-medium">
                      Awaiting telemetry signals from execution engine...
                    </div>
                  ) : (
                    timelineEvents.map((evt, idx) => {
                      const isAlert = evt.event_name.includes('PAUSE') || evt.event_name.includes('ERROR');
                      const isSuccess = evt.event_name.includes('SUBMITTED') || evt.event_name.includes('COMPLETED');

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border space-y-1 transition-all ${
                            isAlert
                              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200'
                              : isSuccess
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                              : 'bg-slate-50 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold border ${
                                isAlert
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300'
                                  : isSuccess
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-300'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
                              }`}
                            >
                              {evt.event_name}
                            </span>
                            <span className="text-slate-400">
                              {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}
                            </span>
                          </div>
                          <div className="text-xs font-medium leading-relaxed">{evt.message}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={timelineEndRef} />
                </div>
              </div>
            </>
          ) : (
            /* Queued Jobs List Tab */
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Jobs In Application Queue ({queuedJobs.length})
              </div>
              {queuedJobs.map((job, idx) => {
                const isCurrent = idx === currentJobIndex && isRunning;
                const isDone = idx < currentJobIndex;
                return (
                  <div
                    key={job.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      isCurrent
                        ? 'bg-indigo-50/70 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700 text-slate-900 dark:text-white shadow-2xs'
                        : isDone
                        ? 'bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                        : 'bg-white border-slate-200 dark:bg-slate-800/80 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="space-y-0.5 pr-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                        <h4 className="text-xs font-bold line-clamp-1">{job.title}</h4>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {job.company} • {job.location}
                      </div>
                    </div>

                    <div>
                      {isCurrent ? (
                        <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Applying...</span>
                        </span>
                      ) : isDone ? (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Applied</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[10px] font-semibold">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Human-In-The-Loop OTP Modal */}
        {otpModalOpen && (
          <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/50 p-5 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Verification Challenge</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Portal requires OTP verification code.</p>
                </div>
              </div>

              <input
                type="text"
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value)}
                placeholder="Enter OTP / Code"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-center tracking-widest text-base focus:ring-2 focus:ring-indigo-500 outline-none"
              />

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  onClick={() => setOtpModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleResume}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Submit &amp; Resume
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};
