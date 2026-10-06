import React, { useEffect, useState } from 'react';
import {
  Globe,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Lock,
  Radio,
  Layers,
  Power,
  KeyRound,
  CheckCircle2,
  Search,
  ExternalLink,
  Info,
  Clock,
  User,
  Zap,
  Check,
  X,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import { PlatformConnectionInfo } from '../types';

interface PlatformConnectionsProps {
  onNavigate?: (tab: any) => void;
}

export const PlatformConnections: React.FC<PlatformConnectionsProps> = ({ onNavigate }) => {
  const [connections, setConnections] = useState<PlatformConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'PORTAL' | 'ATS' | 'CONNECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<{ platform: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await api.listConnections();
      setConnections(data);
    } catch (e) {
      console.error('Failed to load connections:', e);
      showToast('Failed to load connections list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: string, displayName: string) => {
    try {
      setActionLoading(platform);
      setActiveModal({ platform, name: displayName });
      const res = await api.connectPlatform(platform);
      setActiveModal(null);
      if (res.status === 'CONNECTED') {
        showToast(`Successfully connected to ${displayName}! Session encrypted.`, 'success');
      } else {
        showToast(res.message || `Login not completed. Please try again.`, 'error');
      }
      await loadConnections();
    } catch (e: any) {
      setActiveModal(null);
      showToast(`Connection failed: ${e.response?.data?.detail || e.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (platform: string, displayName: string) => {
    try {
      setActionLoading(platform);
      const res = await api.verifyPlatform(platform);
      if (res.is_valid) {
        showToast(`${displayName} session is active and healthy!`, 'success');
      } else {
        showToast(`${displayName} session has expired. Please reconnect.`, 'error');
      }
      await loadConnections();
    } catch (e: any) {
      showToast(`Verification failed: ${e.response?.data?.detail || e.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (platform: string, displayName: string) => {
    if (!window.confirm(`Are you sure you want to disconnect ${displayName}? Stored session tokens will be permanently removed.`)) return;
    try {
      setActionLoading(platform);
      await api.disconnectPlatform(platform);
      showToast(`Disconnected from ${displayName}.`, 'info');
      await loadConnections();
    } catch (e: any) {
      showToast(`Disconnect failed: ${e.response?.data?.detail || e.message}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Platform Brand Icons & Palette
  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'naukri':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#091e42] text-white font-black text-base flex items-center justify-center shadow-sm">
            N
          </div>
        );
      case 'linkedin':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#0A66C2] text-white font-black text-sm flex items-center justify-center shadow-sm">
            in
          </div>
        );
      case 'greenhouse':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#008744] text-white font-black text-sm flex items-center justify-center shadow-sm">
            GH
          </div>
        );
      case 'lever':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#4F46E5] text-white font-black text-sm flex items-center justify-center shadow-sm">
            LV
          </div>
        );
      case 'workday':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#0284C7] text-white font-black text-sm flex items-center justify-center shadow-sm">
            WD
          </div>
        );
      case 'ashby':
        return (
          <div className="w-10 h-10 rounded-2xl bg-[#EA580C] text-white font-black text-sm flex items-center justify-center shadow-sm">
            AS
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
            <Globe className="w-5 h-5" />
          </div>
        );
    }
  };

  // Filtering
  const filteredConnections = connections.filter((conn) => {
    const matchesSearch =
      conn.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conn.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conn.platform.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterCategory === 'PORTAL') return conn.category === 'PORTAL_DISCOVERY';
    if (filterCategory === 'ATS') return conn.category === 'ATS_APPLICATION';
    if (filterCategory === 'CONNECTED') return conn.status === 'CONNECTED';
    return true;
  });

  const portalCount = connections.filter((c) => c.category === 'PORTAL_DISCOVERY').length;
  const atsCount = connections.filter((c) => c.category === 'ATS_APPLICATION').length;
  const connectedCount = connections.filter((c) => c.status === 'CONNECTED').length;

  return (
    <div className="space-y-6 w-full animate-fadeIn pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center space-x-2 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
              : toast.type === 'error'
              ? 'bg-rose-900 text-rose-100 border-rose-700'
              : 'bg-slate-900 text-slate-100 border-slate-700'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Platforms &amp; Integrations</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
              {connectedCount} Connected
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Connect search portals with zero-password session sync and manage direct ATS application adapters.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {connectedCount > 0 && onNavigate && (
            <button
              onClick={() => onNavigate('discovery')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <span>Start Job Discovery</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={loadConnections}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Security Guarantee Pill Banner */}
      <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center space-x-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-[11px]">
            <strong className="text-slate-900 dark:text-white">Zero-Password Architecture:</strong> We never request or store your portal passwords. Browser sessions are captured interactively and encrypted locally via <strong>AES-256-GCM</strong>.
          </span>
        </div>
        <div className="hidden sm:flex items-center space-x-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
          <Lock className="w-3 h-3 text-indigo-500" />
          <span>Encrypted Storage</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl w-full sm:w-auto">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({connections.length})
          </button>
          <button
            onClick={() => setFilterCategory('PORTAL')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'PORTAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Job Portals ({portalCount})
          </button>
          <button
            onClick={() => setFilterCategory('ATS')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'ATS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Company ATS ({atsCount})
          </button>
          <button
            onClick={() => setFilterCategory('CONNECTED')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'CONNECTED'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Active ({connectedCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search platforms..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Grid of Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredConnections.map((conn) => {
          const isPortal = conn.category === 'PORTAL_DISCOVERY';
          const isConnected = conn.status === 'CONNECTED';
          const isReauth = conn.status === 'REAUTH_REQUIRED' || conn.status === 'SESSION_EXPIRED';
          const isBusy = actionLoading === conn.platform;

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
                    {getPlatformIcon(conn.platform)}
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{conn.display_name}</h3>
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

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">
                  {conn.description}
                </p>

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
                      onClick={() => handleConnect(conn.platform, conn.display_name)}
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
                        onClick={() => handleVerify(conn.platform, conn.display_name)}
                        disabled={isBusy}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>Verify</span>
                      </button>
                      <button
                        onClick={() => handleConnect(conn.platform, conn.display_name)}
                        disabled={isBusy}
                        className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <span>Reconnect</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(conn.platform, conn.display_name)}
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
        })}
      </div>

      {/* Interactive Login Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-500/20">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Connecting to {activeModal.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                A secure browser window has opened on your screen. Please enter your credentials and solve any 2FA/OTP directly on the portal.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-400 flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Awaiting login completion in browser window...</span>
            </div>

            <p className="text-[10px] text-slate-400">
              Once you log in, the browser window will close automatically and your session will be encrypted.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
