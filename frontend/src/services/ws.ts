import { getAccessToken } from './http';
import { TimelineEvent } from '../types';

export interface WebSocketMessage {
  type: string;
  run_id?: string;
  frame_jpeg_base64?: string;
  url?: string;
  event_name?: string;
  state?: string;
  message?: string;
  stats?: {
    discovered: number;
    matched: number;
    applied: number;
  };
  payload?: any;
  timestamp?: string;
  command?: string;
  status?: string;
  challenge_type?: string;
}

export type BinaryFrameListener = (blobOrBuffer: Blob | ArrayBuffer) => void;
export type NavListener = (url: string) => void;
export type FrameListener = (base64Jpeg: string, url?: string) => void;
export type EventListener = (event: TimelineEvent) => void;
export type MessageListener = (msg: WebSocketMessage) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private binaryFrameListeners: Set<BinaryFrameListener> = new Set();
  private navListeners: Set<NavListener> = new Set();
  private frameListeners: Set<FrameListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private reconnectTimeout: any = null;
  private isExplicitClose = false;
  private reconnectAttempts = 0;

  async connect() {
    this.isExplicitClose = false;
    const token = getAccessToken();
    if (!token) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    let wsUrl = `${protocol}//${host}/ws`;
    try {
      // 1. Preferred: Ephemeral single-use ticket (prevents token leakage in query params)
      const token = getAccessToken();
      if (token) {
        try {
          const resp = await fetch('/api/v1/ws/ticket', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.ticket) {
              wsUrl = `${protocol}//${host}/ws?ticket=${data.ticket}`;
            }
          } else {
            // Fallback to query token if ticket generation fails
            wsUrl = `${protocol}//${host}/ws?token=${token}`;
          }
        } catch {
          wsUrl = `${protocol}//${host}/ws?token=${token}`;
        }
      }
    } catch {
      // If window fetch fails, proceed with default
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('[WebSocket] Connected to ApplyFlow Live Stream.');
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };

      this.socket.onmessage = (event) => {
        // 1. High-Performance Binary Frame from Native CDP Screencast
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          this.binaryFrameListeners.forEach((listener) => listener(event.data));
          return;
        }

        try {
          const msg: WebSocketMessage = JSON.parse(event.data);

          // 2. Navigation URL update
          if (msg.type === 'BROWSER_NAVIGATED' && msg.url) {
            this.navListeners.forEach((listener) => listener(msg.url!));
          }

          // 3. Fallback visual frame
          if (msg.type === 'BROWSER_FRAME' && msg.frame_jpeg_base64) {
            this.frameListeners.forEach((listener) => listener(msg.frame_jpeg_base64!, msg.url));
          }

          // 4. Automation Timeline Event
          if (msg.type === 'AUTOMATION_TIMELINE_EVENT' || msg.type === 'APPLICATION_EVENT') {
            const timelineEvt: TimelineEvent = {
              run_id: msg.run_id || '',
              event_name: msg.event_name || msg.type,
              state: msg.state || 'ACTIVE',
              message: msg.message || '',
              stats: msg.stats,
              payload: msg.payload,
              timestamp: msg.timestamp || new Date().toISOString(),
            };
            this.eventListeners.forEach((listener) => listener(timelineEvt));
          }

          // 5. Generic Message Dispatch
          this.messageListeners.forEach((listener) => listener(msg));
        } catch (err) {
          console.error('[WebSocket] Error parsing message:', err);
        }
      };

      this.socket.onclose = () => {
        if (!this.isExplicitClose) {
          // Wait longer after each failed try (3s, 6s, 12s ... up to 30s) instead of hammering the server (FE-05).
          const delay = Math.min(30000, 3000 * 2 ** this.reconnectAttempts);
          this.reconnectAttempts += 1;
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
      };
    } catch (e) {
      console.error('[WebSocket] Failed to connect:', e);
    }
  }

  disconnect() {
    this.isExplicitClose = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  sendCommand(command: string, runId?: string, input?: string, lastSeenSeq?: number) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          command,
          run_id: runId,
          input,
          last_seen_seq: lastSeenSeq,
        })
      );
    } else {
      console.warn('[WebSocket] Cannot send command; socket not connected.');
    }
  }

  onBinaryFrame(listener: BinaryFrameListener) {
    this.binaryFrameListeners.add(listener);
    return () => this.binaryFrameListeners.delete(listener);
  }

  onNavigation(listener: NavListener) {
    this.navListeners.add(listener);
    return () => this.navListeners.delete(listener);
  }

  onFrame(listener: FrameListener) {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onEvent(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onMessage(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
}

export const wsClient = new WebSocketClient();
