import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Columns, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { AutomationRunStatus } from '../types';
import { useToast } from '../context/ToastContext';
import { RunHeader } from './live/RunHeader';
import { CompletionBanner } from './live/CompletionBanner';
import { BrowserViewport } from './live/BrowserViewport';
import { OtpModal } from './live/OtpModal';
import { useLiveStream } from './live/useLiveStream';
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
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [sourceType] = useState('naukri');
  const [isStarting, setIsStarting] = useState(false);
  const {
    timelineEvents,
    setTimelineEvents,
    completedSummary,
    setCompletedSummary,
    currentExecutionState,
    setCurrentExecutionState,
    liveUrl,
    hasReceivedFrame,
    canvasRef,
  } = useLiveStream({
    activeRun,
    onRefreshStatus,
    onOtpRequired: () => setOtpModalOpen(true),
    showSuccess,
  });

  useEffect(() => {
    // Clear legacy desktop window toggle to ensure pure in-UI streaming
    localStorage.removeItem('show_desktop_browser');
  }, []);


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
      <RunHeader isRunning={isRunning} isPaused={isPaused} isStarting={isStarting} viewMode={viewMode} setViewMode={setViewMode} handleStartProfileRun={handleStartProfileRun} handlePause={handlePause} handleResume={handleResume} handleStop={handleStop} onNavigate={onNavigate} />

      {completedSummary && (
        <CompletionBanner completedSummary={completedSummary} onDismiss={() => { setCompletedSummary(null); setCurrentExecutionState('IDLE'); onRefreshStatus(); }} onNavigate={onNavigate} />
      )}

      {/* Dual Stream Grid: Browser Frame Canvas + Realtime Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Frame Canvas */}
        <BrowserViewport activeRun={activeRun} isRunning={isRunning} isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} viewMode={viewMode} currentExecutionState={currentExecutionState} liveUrl={liveUrl} hasReceivedFrame={hasReceivedFrame} sourceType={sourceType} canvasRef={canvasRef} viewportContainerRef={viewportContainerRef} />

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
      <OtpModal open={otpModalOpen} onClose={() => setOtpModalOpen(false)} value={otpValue} onChange={setOtpValue} onSubmit={handleResume} />
    </div>
  );
};
