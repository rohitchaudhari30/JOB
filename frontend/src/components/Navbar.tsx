import React, { useState, useRef, useEffect } from 'react';
import { Bot, ShieldCheck, LogOut, UserCheck, Clock, Zap, Menu, User as UserIcon } from 'lucide-react';
import { User, AutomationRunStatus } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { BRAND_NAME, BRAND_SUFFIX } from '../utils/brand';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNavigate?: (tab: any) => void;
  activeRun?: AutomationRunStatus | null;
  onOpenLiveConsole?: () => void;
  onMenuClick?: () => void;
  navOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onNavigate,
  activeRun = null,
  onOpenLiveConsole,
  onMenuClick,
  navOpen = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNav = (tab: string) => {
    setDropdownOpen(false);
    setNotificationsOpen(false);
    if (onNavigate) {
      onNavigate(tab);
    }
  };

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-200 shadow-xs">
      <div className="flex items-center space-x-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={navOpen}
            aria-controls="primary-navigation"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/20 ring-1 ring-white/20">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
            {BRAND_NAME}<span className="text-indigo-600 dark:text-indigo-400">{BRAND_SUFFIX}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2.5 sm:space-x-3">
        {/* Live Run Active Global Pill */}
        {activeRun && (activeRun.status === 'RUNNING' || activeRun.status === 'PAUSED') && (
          <button
            onClick={() => {
              if (onOpenLiveConsole) {
                onOpenLiveConsole();
              } else if (onNavigate) {
                onNavigate('live_console');
              }
            }}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/90 text-xs text-indigo-700 font-bold dark:bg-indigo-950/70 dark:border-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition-all cursor-pointer shadow-2xs group active:scale-95"
            title="Live Automation in progress. Click to view console."
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${activeRun.status === 'PAUSED' ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${activeRun.status === 'PAUSED' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className="font-extrabold uppercase tracking-wider text-[10px] bg-indigo-200/60 dark:bg-indigo-900 px-1.5 py-0.5 rounded">
              LIVE
            </span>
            <span className="hidden md:inline truncate max-w-[140px]">
              {activeRun.current_job_title ? activeRun.current_job_title : `${activeRun.applications_submitted_count} Applied`}
            </span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono hidden sm:inline">
              ({activeRun.applications_submitted_count} submitted)
            </span>
          </button>
        )}

        {/* Stealth badge */}
        <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-700 font-semibold dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Stealth Guard Active</span>
        </div>

        {/* Circular Theme Toggle Button */}
        <ThemeToggle />

        <NotificationBell
          open={notificationsOpen}
          onToggle={() => {
            setNotificationsOpen(!notificationsOpen);
            setDropdownOpen(false);
          }}
          onClose={() => setNotificationsOpen(false)}
          onNavigate={handleNav}
        />

        {/* User profile circular avatar button */}
        {user ? (
          <div className="relative pl-1 border-l border-slate-200 dark:border-slate-800" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                setNotificationsOpen(false);
              }}
              className="relative w-9 h-9 rounded-full flex items-center justify-center p-0.5 ring-2 ring-slate-200/80 hover:ring-indigo-500 dark:ring-slate-700 dark:hover:ring-indigo-400 transition-all duration-200 cursor-pointer focus:outline-none active:scale-90"
              aria-label="User profile menu"
              aria-expanded={dropdownOpen}
              title={user.full_name || user.email}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl backdrop-blur-xl py-2 z-50 animate-scaleUp origin-top-right">
                {/* Account Info Card */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80">
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Signed in as
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate pt-0.5">
                    {user.full_name || 'Lead Engineer'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </p>
                  <div className="mt-2 inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/60 dark:bg-indigo-500/10 dark:border-indigo-500/30 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                    <Zap className="w-2.5 h-2.5" />
                    <span>Autonomous Pro Tier</span>
                  </div>
                </div>

                {/* Quick Links */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => handleNav('profile')}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white flex items-center space-x-2.5 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    <span>Candidate Profile &amp; Resumes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNav('direct_apply')}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white flex items-center space-x-2.5 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    <span>Autopilot Campaigns &amp; 24/7 Schedules</span>
                  </button>
                </div>

                {/* Sign Out Divider & Button */}
                <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 flex items-center space-x-2.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <UserIcon className="w-5 h-5 text-slate-400" />
          </div>
        )}
      </div>
    </header>
  );
};
