import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { SectionTabs } from './components/SectionTabs';
import { BRAND_NAME, BRAND_SUFFIX } from './utils/brand';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './context/ThemeContext';
import { api, setAuthToken } from './services/api';
import { wsClient } from './services/ws';
import { AutomationRunStatus, User } from './types';
import { useToast } from './context/ToastContext';
import { Bot, LogIn, Sparkles } from 'lucide-react';
import { resolveTab, getTabFromLocation, TAB_TO_PATH, TAB_TITLES } from './utils/navigation';

// Pages load on demand so the first screen downloads less code (FE-03).
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const LiveAutomation = lazy(() => import('./pages/LiveAutomation').then((m) => ({ default: m.LiveAutomation })));
const AIMatches = lazy(() => import('./pages/AIMatches').then((m) => ({ default: m.AIMatches })));
const JobDiscovery = lazy(() => import('./pages/JobDiscovery').then((m) => ({ default: m.JobDiscovery })));
const ApplicationCRM = lazy(() => import('./pages/ApplicationCRM').then((m) => ({ default: m.ApplicationCRM })));
const ProfileManager = lazy(() => import('./pages/ProfileManager').then((m) => ({ default: m.ProfileManager })));
const PlatformConnections = lazy(() => import('./pages/PlatformConnections').then((m) => ({ default: m.PlatformConnections })));
const DirectApply = lazy(() => import('./pages/DirectApply').then((m) => ({ default: m.DirectApply })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));

export const App: React.FC = () => {
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState<NavTab>(() => getTabFromLocation());
  const [user, setUser] = useState<User | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<AutomationRunStatus | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // URL & Browser History Synchronization
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromLocation();
      setActiveTab(tab);
      if (typeof document !== 'undefined') {
        document.title = TAB_TITLES[tab] || BRAND_NAME;
      }
    };

    // Ensure URL in browser matches activeTab on initial mount (e.g. normalize '/' to '/home')
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const targetPath = TAB_TO_PATH[activeTab] || '/home';
      if (currentPath === '/' || currentPath === '' || currentPath !== targetPath) {
        window.history.replaceState({ tab: activeTab }, '', targetPath);
      }
      if (typeof document !== 'undefined') {
        document.title = TAB_TITLES[activeTab] || BRAND_NAME;
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
      loadCurrentUser();
    }

    const handleAuthExpired = () => {
      setUser(null);
      showError('Session expired. Please sign in again.');
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    if (user) {
      wsClient.connect();
      loadActiveRun();
      const interval = setInterval(loadActiveRun, 5000);
      return () => {
        clearInterval(interval);
        wsClient.disconnect();
      };
    }
  }, [user]);

  const loadCurrentUser = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch (e) {
      console.warn('Session expired or invalid token');
      setAuthToken(null);
      setUser(null);
    }
  };

  const loadActiveRun = async () => {
    try {
      const run = await api.getActiveRun();
      setActiveRun(run);
    } catch (e) {
      // Ignored if unauthenticated or network error
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        const res = await api.register(authEmail, authPassword, authFullName);
        setAuthToken(res.access_token, res.refresh_token);
        const u = await api.getMe();
        setUser(u);
        showSuccess('Account created successfully!');
      } else {
        const res = await api.login(authEmail, authPassword);
        setAuthToken(res.access_token, res.refresh_token);
        const u = await api.getMe();
        setUser(u);
        showSuccess('Welcome back!');
      }
    } catch (e: any) {
      showError(`Authentication failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setAuthLoading(true);
    try {
      // Try login first
      try {
        const res = await api.login('demo.engineer@example.com', 'SecurePassword123!');
        setAuthToken(res.access_token, res.refresh_token);
        const u = await api.getMe();
        setUser(u);
        showSuccess('Logged in as demo user!');
        return;
      } catch (err) {
        // If user doesn't exist, auto-register
        const regRes = await api.register(
          'demo.engineer@example.com',
          'SecurePassword123!',
          'Lead Automation Engineer'
        );
        setAuthToken(regRes.access_token, regRes.refresh_token);
        const u = await api.getMe();
        setUser(u);
        showSuccess('Demo user registered and logged in!');
      }
    } catch (e: any) {
      showError(`Demo login failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    void api.logout(); // revoke tokens on the server; runs before we clear them below
    setAuthToken(null);
    setUser(null);
    wsClient.disconnect();
    showSuccess('Logged out successfully');
  };

  if (!user) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''} bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 selection:bg-indigo-500 selection:text-white relative overflow-hidden transition-colors duration-200`}>
        {/* Ambient background glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 dark:bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top right theme toggle on login page */}
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-8 shadow-2xl backdrop-blur-md space-y-6 relative z-10 animate-scaleUp">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 mx-auto ring-1 ring-white/20">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight pt-1">
              {BRAND_NAME}<span className="text-indigo-600 dark:text-indigo-400">{BRAND_SUFFIX}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Autonomous Multi-Platform Job Application Engine
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isRegisterMode && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-950 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Work Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="developer@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-950 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 dark:bg-slate-950 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-transform active:scale-95 disabled:opacity-50 mt-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {authLoading
                  ? 'Authenticating...'
                  : isRegisterMode
                  ? 'Create Free Account'
                  : 'Sign In to Console'}
              </span>
            </button>

            {/* Demo shortcut exists only in local dev builds (SEC-02). */}
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                disabled={authLoading}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center space-x-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>⚡ 1-Click Instant Demo Access</span>
              </button>
            )}
          </form>

          <div className="text-center pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsRegisterMode(!isRegisterMode)}
              className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-semibold transition-colors cursor-pointer"
            >
              {isRegisterMode
                ? 'Already have an account? Sign in'
                : "Don't have an account? Register now"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleTabChange = (target: NavTab | string, replace = false) => {
    const canonicalTab = resolveTab(target);
    const targetPath = TAB_TO_PATH[canonicalTab] || '/home';
    setActiveTab(canonicalTab);

    if (typeof window !== 'undefined') {
      if (window.location.pathname !== targetPath) {
        if (replace) {
          window.history.replaceState({ tab: canonicalTab }, '', targetPath);
        } else {
          window.history.pushState({ tab: canonicalTab }, '', targetPath);
        }
      }
      if (typeof document !== 'undefined') {
        document.title = TAB_TITLES[canonicalTab] || BRAND_NAME;
      }
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''} bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200`}>
      <Navbar
        user={user}
        onLogout={handleLogout}
        onNavigate={handleTabChange}
        activeRun={activeRun}
        onOpenLiveConsole={() => handleTabChange('live_console')}
        onMenuClick={() => setNavOpen((v) => !v)}
        navOpen={navOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          user={user}
          stats={{
            isLiveRunning: activeRun?.status === 'RUNNING',
            runStatus: activeRun?.status ?? null,
          }}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8 w-full">
          <SectionTabs activeTab={activeTab} onTabChange={handleTabChange} />
          <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<div className="p-8 text-sm text-slate-500" role="status">Loading…</div>}>
          {activeTab === 'dashboard' && (
            <Dashboard onNavigate={handleTabChange} activeRun={activeRun} />
          )}
          {activeTab === 'direct_apply' && (
            <DirectApply onNavigate={handleTabChange} />
          )}
          {activeTab === 'live_console' && (
            <LiveAutomation
              activeRun={activeRun}
              onRefreshStatus={loadActiveRun}
              onNavigate={handleTabChange}
            />
          )}
          {activeTab === 'matches' && <AIMatches onNavigate={handleTabChange} />}
          {activeTab === 'discovery' && (
            <JobDiscovery
              activeRun={activeRun}
              onRefreshStatus={loadActiveRun}
              onNavigate={handleTabChange}
            />
          )}
          {activeTab === 'connections' && <PlatformConnections onNavigate={handleTabChange} />}
          {(activeTab === 'crm' || (activeTab as string) === 'applications') && <ApplicationCRM onNavigate={handleTabChange} />}
          {activeTab === 'analytics' && <Analytics onNavigate={handleTabChange} />}
          {activeTab === 'profile' && <ProfileManager onNavigate={handleTabChange} />}
          {activeTab === 'schedules' && <DirectApply onNavigate={handleTabChange} initialTab="schedules" />}
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default App;
