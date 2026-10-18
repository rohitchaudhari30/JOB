import React from 'react';
import { AlertTriangle, RefreshCw, Power, KeyRound, Zap, Check, Loader2 } from 'lucide-react';
import type { PlatformConnectionInfo } from '../../types';
import { PlatformIcon } from './PlatformIcon';

interface Props {
  conn: PlatformConnectionInfo;
  isBusy: boolean;
  onConnect: (platform: string, displayName: string) => void;
  onVerify: (platform: string, displayName: string) => void;
  onDisconnect: (platform: string, displayName: string) => void;
}

export const PlatformCard: React.FC<Props> = ({ conn, isBusy, onConnect, onVerify, onDisconnect }) => {
  const isPortal = conn.category === 'PORTAL_DISCOVERY';
  const isConnected = conn.status === 'CONNECTED';
  const isReauth = conn.status === 'REAUTH_REQUIRED' || conn.status === 'SESSION_EXPIRED';

  return (
    <div
      key={conn.platform}
      className={`flex flex-col justify-between p-5 rounded-3xl bg-white dark:bg-slate-900/90 border transition-all duration-200 shadow-sm hover:shadow-md ${
        isConnected
          ? 'border-emerald-200/90 dark:border-emerald-500/30'
          : isReauth
            ? 'border-amber-200/90 dark:border-amber-500/30'
            : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      {/* Card Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <PlatformIcon platform={conn.platform} />
            <div>
              <div className="flex items-center space-x-1.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">{conn.display_name}</h2>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {isPortal ? 'Job Portal' : 'Direct ATS'}
              </span>
            </div>
          </div>

          {/* Status Indicator Pill */}
          {isConnected ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              Active
            </span>
          ) : isReauth ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
              <AlertTriangle className="w-2.5 h-2.5 mr-1" />
              Reauth Needed
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
              Not Connected
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">{conn.description}</p>

        {/* Account / Session Info (Portals only) */}
        {isPortal && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Account:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[140px]">
                {conn.external_account_reference || (isConnected ? 'Active Session' : '—')}
              </span>
            </div>
            {conn.last_verified_at && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Last verified:</span>
                <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                  {new Date(conn.last_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ATS Auto-Ready Tag */}
        {!isPortal && (
          <div className="p-2.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center space-x-2 text-xs">
            <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              Public career access — zero login required.
            </span>
          </div>
        )}

        {/* Capabilities micro tags */}
        <div className="flex flex-wrap gap-1 pt-1">
          {conn.capabilities.map((cap) => (
            <span
              key={cap}
              className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
            >
              {cap.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
        {isPortal ? (
          !isConnected ? (
            <button
              onClick={() => onConnect(conn.platform, conn.display_name)}
              disabled={isBusy}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Connect {conn.display_name}</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onVerify(conn.platform, conn.display_name)}
                disabled={isBusy}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                <span>Verify</span>
              </button>
              <button
                onClick={() => onConnect(conn.platform, conn.display_name)}
                disabled={isBusy}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>Reconnect</span>
              </button>
              <button
                onClick={() => onDisconnect(conn.platform, conn.display_name)}
                disabled={isBusy}
                title="Disconnect and remove saved session"
                className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        ) : (
          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-slate-400 font-medium text-[11px]">Status</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 text-[11px]">
              <Check className="w-3.5 h-3.5" />
              <span>Ready for Auto-Apply</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
