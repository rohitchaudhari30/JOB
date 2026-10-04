import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { Dashboard } from './pages/Dashboard';
import { LiveAutomation } from './pages/LiveAutomation';
import { AIMatches } from './pages/AIMatches';
import { JobDiscovery } from './pages/JobDiscovery';
import { ApplicationCRM } from './pages/ApplicationCRM';
import { ProfileManager } from './pages/ProfileManager';
import { PlatformConnections } from './pages/PlatformConnections';
import { DirectApply } from './pages/DirectApply';
import { ScheduleManager } from './pages/ScheduleManager';
import { Analytics } from './pages/Analytics';
import { useTheme } from './context/ThemeContext';
import { api, setAuthToken } from './services/api';
import { wsClient } from './services/ws';
import { AutomationRunStatus, User } from './types';
import { useToast } from './context/ToastContext';
import { Bot, LogIn, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [activeRun, setActiveRun] = useState<AutomationRunStatus | null>(null);
  const [authEmail, setAuthEmail] = useState('demo.engineer@example.com');
  const [authPassword, setAuthPassword] = useState('SecurePassword123!');
  const [authFullName, setAuthFullName] = useState('Lead Automation Engineer');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
      loadCurrentUser();
    }
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
    // Polls active run status if needed
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        const res = await api.register(authEmail, authPassword, authFullName);
        setAuthToken(res.access_token);
        const u = await api.getMe();
        setUser(u);
        showSuccess('Account created successfully!');
      } else {
        const res = await api.login(authEmail, authPassword);
        setAuthToken(res.access_token);
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
        setAuthToken(res.access_token);
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
        setAuthToken(regRes.access_token);
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
              ApplyFlow<span className="text-indigo-600 dark:text-indigo-400">.AI</span>
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

            <button
              type="button"
              onClick={handleQuickDemoLogin}
              disabled={authLoading}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center space-x-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>⚡ 1-Click Instant Demo Access</span>
            </button>
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

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''} bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200`}>
      <Navbar user={user} onLogout={handleLogout} onNavigate={setActiveTab} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          stats={{
            isLiveRunning: activeRun?.status === 'RUNNING',
          }}
        />

        <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <Dashboard onNavigate={setActiveTab} activeRun={activeRun} />
          )}
          {activeTab === 'direct_apply' && (
            <DirectApply onNavigate={setActiveTab} />
          )}
          {activeTab === 'live_console' && (
            <LiveAutomation
              activeRun={activeRun}
              onRefreshStatus={loadActiveRun}
            />
          )}
          {activeTab === 'matches' && <AIMatches />}
          {activeTab === 'discovery' && <JobDiscovery />}
          {activeTab === 'connections' && <PlatformConnections />}
          {activeTab === 'crm' && <ApplicationCRM />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'profile' && <ProfileManager onNavigate={setActiveTab} />}
          {activeTab === 'schedules' && <ScheduleManager />}
        </main>
      </div>
    </div>
  );
};

export default App;
