import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  KeyRound,
  Terminal,
  Activity,
} from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { AutomationRunStatus, TimelineEvent } from '../types';
import { useToast } from '../context/ToastContext';

interface LiveAutomationProps {
  activeRun: AutomationRunStatus | null;
  onRefreshStatus: () => void;
}

export const LiveAutomation: React.FC<LiveAutomationProps> = ({ activeRun, onRefreshStatus }) => {
  const { showError, showSuccess } = useToast();
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [rolesInput, setRolesInput] = useState('Senior Backend Engineer, Lead Python Engineer');
  const [locationsInput, setLocationsInput] = useState('Bengaluru, Remote');
  const [sourceType, setSourceType] = useState('naukri');
  const [autoApply, setAutoApply] = useState(true);
  const [maxJobAgeHours, setMaxJobAgeHours] = useState<string>('24');
  const [preferFresh, setPreferFresh] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Listen to live WebSocket frame broadcasts
    const unsubscribeFrame = wsClient.onFrame((b64) => {
      setFrameBase64(`data:image/jpeg;base64,${b64}`);
    });

    // Listen to live timeline events
    const unsubscribeEvent = wsClient.onEvent((event) => {
      setTimelineEvents((prev) => [...prev, event]);
      if (event.event_name === 'PAUSED_FOR_USER' || event.state === 'PAUSED_OTP') {
        setOtpModalOpen(true);
      }
    });

    return () => {
      unsubscribeFrame();
      unsubscribeEvent();
    };
  }, []);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timelineEvents]);

  const handleStartRun = async () => {
    try {
      setIsStarting(true);
      const roles = rolesInput.split(',').map((r) => r.trim()).filter(Boolean);
      const locations = locationsInput.split(',').map((l) => l.trim()).filter(Boolean);

      const run = await api.startAutomation({
        source_type: sourceType,
        roles,
        locations,
        auto_apply_matches: autoApply,
        max_applications: 10,
        auto_apply_threshold: 85.0,
        max_job_age_hours: maxJobAgeHours ? parseFloat(maxJobAgeHours) : undefined,
        prefer_fresh_hours: preferFresh ? 6.0 : undefined,
        freshness_weight: 0.10,
      });

      setTimelineEvents([
        {
          run_id: run.run_id,
          event_name: 'RUN_INITIALIZED',
          state: 'INITIALIZING',
          message: `Automation started for ${roles.join(', ')} on [${sourceType.toUpperCase()}]. Freshness filter: ${maxJobAgeHours ? `Within ${maxJobAgeHours}h` : 'Any time'}.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      showSuccess('Automation started successfully!');
      onRefreshStatus();
    } catch (e: any) {
      showError(`Failed to start automation: ${e.response?.data?.detail || e.message}`);
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
      {/* Control & Configuration Bar */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Source Platform
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              disabled={isRunning}
              className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            >
              <option value="naukri">Naukri.com</option>
              <option value="linkedin">LinkedIn (Easy Apply)</option>
              <option value="greenhouse">Greenhouse ATS</option>
              <option value="lever">Lever ATS</option>
              <option value="workday">Workday ATS</option>
              <option value="ashby">Ashby ATS</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Target Job Roles
            </label>
            <input
              type="text"
              value={rolesInput}
              onChange={(e) => setRolesInput(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. Lead Engineer, Staff Python"
              className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 w-60 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Locations
            </label>
            <input
              type="text"
              value={locationsInput}
              onChange={(e) => setLocationsInput(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. Bengaluru, Remote"
              className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 w-36 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            />
          </div>

          {/* Job Freshness Rule Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Job Freshness Gate
            </label>
            <select
              value={maxJobAgeHours}
              onChange={(e) => setMaxJobAgeHours(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            >
              <option value="1">Posted within 1 hour</option>
              <option value="6">Posted within 6 hours</option>
              <option value="24">Posted within 24 hours</option>
              <option value="72">Posted within 3 days</option>
              <option value="168">Posted within 7 days</option>
              <option value="">Any time (No age filter)</option>
            </select>
          </div>

          <div className="flex items-center space-x-2 pt-6">
            <input
              type="checkbox"
              id="autoApplyToggle"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              disabled={isRunning}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700"
            />
            <label htmlFor="autoApplyToggle" className="text-xs font-semibold text-slate-700 dark:text-slate-300 select-none cursor-pointer">
              Auto Apply on &gt;85% Match
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5">
          {!isRunning ? (
            <button
              onClick={handleStartRun}
              disabled={isStarting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isStarting ? 'Initializing Engine...' : 'Start Auto-Apply Run'}</span>
            </button>
          ) : (
            <>
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
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
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
            </>
          )}
        </div>
      </div>

      {/* Dual Stream Grid: Browser Frame Canvas + Realtime Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Frame Canvas (7 cols) */}
        <div className="lg:col-span-7 flex flex-col rounded-3xl bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg min-h-[480px]">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
              <span className="text-xs font-bold text-slate-300 pl-2">Live Automation Viewport</span>
            </div>

            <div className="flex items-center space-x-2">
              {isRunning && (
                <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>5 FPS STREAM</span>
                </span>
              )}
              <span className="text-[11px] text-slate-400 font-mono">1280x800</span>
            </div>
          </div>

          <div className="flex-1 bg-slate-950/90 flex items-center justify-center relative p-2">
            {frameBase64 ? (
              <img
                src={frameBase64}
                alt="Live Automation Browser Frame"
                className="w-full h-full object-contain rounded-xl border border-slate-800 shadow-inner"
              />
            ) : (
              <div className="text-center p-8 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                  <Activity className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="text-sm font-bold text-slate-200">Live Browser Stream Ready</div>
                <p className="text-xs text-slate-400 max-w-sm">
                  Start an auto-apply run to stream real-time DOM interactions, field filling, and multi-step progression.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Live Timeline & Telemetry (5 cols) */}
        <div className="lg:col-span-5 flex flex-col rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 overflow-hidden shadow-lg h-[560px]">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200/80 dark:bg-slate-950 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-xs text-slate-800 dark:text-white">
              <Terminal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Telemetry &amp; Audit Events</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{timelineEvents.length} events</span>
          </div>

          {/* Event Stream list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
            {timelineEvents.length === 0 ? (
              <div className="text-center py-20 text-slate-400 dark:text-slate-600 font-sans text-xs">
                Awaiting telemetry events from orchestrator...
              </div>
            ) : (
              timelineEvents.map((evt, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/80 dark:border-slate-800/80 space-y-1.5 shadow-xs"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20">
                      {evt.event_name}
                    </span>
                    <span className="text-slate-400">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed font-sans">{evt.message}</div>
                  {evt.stats && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center space-x-3 pt-1 border-t border-slate-200 dark:border-slate-800/50">
                      <span>Found: {evt.stats.discovered}</span>
                      <span>Matched: {evt.stats.matched}</span>
                      <span>Applied: {evt.stats.applied}</span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={timelineEndRef} />
          </div>
        </div>
      </div>

      {/* Challenge / OTP Modal (Human In The Loop) */}
      {otpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-indigo-200 dark:bg-slate-900 dark:border-indigo-500/40 p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Verification Challenge Detected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Portal requires OTP verification or CAPTCHA confirmation.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
              The automation engine has safely paused. Please enter the OTP code sent to your registered phone/email or solve the challenge on your portal.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Enter OTP Code / Verification Token
              </label>
              <input
                type="text"
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value)}
                placeholder="e.g. 123456"
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white font-mono text-center tracking-widest text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setOtpModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              >
                Dismiss
              </button>
              <button
                onClick={handleResume}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-transform active:scale-95"
              >
                Submit Code &amp; Resume Auto-Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
