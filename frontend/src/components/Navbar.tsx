import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Bell,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  ChevronDown,
  LogOut,
  UserCheck,
  Clock,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { User } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNavigate?: (tab: any) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onNavigate }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
    if (onNavigate) {
      onNavigate(tab);
    }
  };

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-200 shadow-xs">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-600/20 ring-1 ring-white/20">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
            ApplyFlow<span className="text-indigo-600 dark:text-indigo-400">.ai</span>
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Stealth badge */}
        <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-700 font-semibold dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Stealth Guard Active</span>
        </div>

        {/* Circular Theme Toggle Button */}
        <ThemeToggle />

        {/* Notification Bell */}
        <button
          type="button"
          title="System Notifications"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors relative border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-white dark:ring-slate-900"></span>
        </button>

        {/* User profile circular avatar button */}
        {user ? (
          <div className="relative pl-1 border-l border-slate-200 dark:border-slate-800" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
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
                    onClick={() => handleNav('schedules')}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white flex items-center space-x-2.5 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                    <span>Rules &amp; Automation Schedules</span>
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
