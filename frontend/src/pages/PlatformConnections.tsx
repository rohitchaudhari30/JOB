import React, { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Lock, Search, ArrowRight } from 'lucide-react';
import { ToastBanner } from './connections/ToastBanner';
import { PlatformCard } from './connections/PlatformCard';
import { LoginModal } from './connections/LoginModal';
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
  // ATS boards need no login, so only count platforms that really have a saved login (CON-02).
  const connectedCount = connections.filter((c) => c.is_auth_required && c.status === 'CONNECTED').length;

  return (
    <div className="space-y-6 w-full animate-fadeIn pb-12">
      {/* Toast Notification */}
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

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
            <button type="button"
              onClick={() => onNavigate('discovery')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <span>Start Job Discovery</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button type="button"
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
          <button type="button"
            onClick={() => setFilterCategory('ALL')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({connections.length})
          </button>
          <button type="button"
            onClick={() => setFilterCategory('PORTAL')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'PORTAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Job Portals ({portalCount})
          </button>
          <button type="button"
            onClick={() => setFilterCategory('ATS')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'ATS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Company ATS ({atsCount})
          </button>
          <button type="button"
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
        {filteredConnections.map((conn) => (
          <PlatformCard
            key={conn.platform}
            conn={conn}
            isBusy={actionLoading === conn.platform}
            onConnect={handleConnect}
            onVerify={handleVerify}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      {/* Interactive Login Modal: waits for the portal login, so it is not dismissible */}
      <LoginModal activeModal={activeModal} />
    </div>
  );
};
