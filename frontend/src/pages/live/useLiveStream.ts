import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { wsClient } from '../../services/ws';
import { AutomationRunStatus, TimelineEvent } from '../../types';

export interface CompletedSummary {
  discovered: number;
  matched: number;
  applied: number;
  message: string;
}

interface Options {
  activeRun: AutomationRunStatus | null;
  onRefreshStatus: () => void;
  onOtpRequired: () => void;
  showSuccess: (message: string) => void;
}

/** Live automation stream: history rehydration, websocket frames and timeline events. */
export function useLiveStream({ activeRun, onRefreshStatus, onOtpRequired, showSuccess }: Options) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // Rehydrate historical timeline events on mount or when activeRun changes
  useEffect(() => {
    if (!activeRun?.run_id) return;
    let isCancelled = false;

    api
      .getRunEvents(activeRun.run_id)
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

  const [completedSummary, setCompletedSummary] = useState<CompletedSummary | null>(null);
  const [currentExecutionState, setCurrentExecutionState] = useState<string>('IDLE');
  const [liveUrl, setLiveUrl] = useState<string>('');
  const [hasReceivedFrame, setHasReceivedFrame] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
          api
            .getRunEvents(event.run_id, maxSeq)
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
        onOtpRequired();
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
      } else if (event.event_name === 'RUN_STARTED' || event.event_name === 'RUN_ABORTED') {
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

  return {
    timelineEvents,
    setTimelineEvents,
    completedSummary,
    setCompletedSummary,
    currentExecutionState,
    setCurrentExecutionState,
    liveUrl,
    hasReceivedFrame,
    canvasRef,
  };
}
