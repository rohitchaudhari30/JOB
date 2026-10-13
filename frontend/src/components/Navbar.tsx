import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Bell,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  LogOut,
  UserCheck,
  Clock,
  Zap,
  CheckCheck,
  Trash2,
  Briefcase,
  X,
  ChevronRight,
} from 'lucide-react';
import { User, AutomationRunStatus } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNavigate?: (tab: any) => void;
  activeRun?: AutomationRunStatus | null;
  onOpenLiveConsole?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'match' | 'discovery' | 'system' | 'automation' | 'security';
  read: boolean;
  tabLink?: string;
}

// No made-up notifications: the list starts empty and only holds real events.
const DEFAULT_NOTIFICATIONS: NotificationItem[] = [];

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onNavigate,
  activeRun = null,
  onOpenLiveConsole,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem('applyflow_notifications');
      return saved ? JSON.parse(saved) : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('applyflow_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.error('Failed to save notifications to localStorage', e);
    }
  }, [notifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOneAsRead = (id: string, tabLink?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (tabLink) {
      handleNav(tabLink);
    }
  };

  const removeNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'match':
        return (
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      case 'discovery':
        return (
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Briefcase className="w-4 h-4" />
          </div>
        );
      case 'security':
        return (
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
        );
      case 'automation':
      default:
        return (
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <Bot className="w-4 h-4" />
          </div>
        );
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

        {/* Interactive Notification Bell with Dropdown */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setDropdownOpen(false);
            }}
            title="System Notifications"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors relative border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer active:scale-95"
            aria-label="Toggle notifications menu"
            aria-expanded={notificationsOpen}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>
            )}
          </button>

          {/* Notification Popover Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl backdrop-blur-xl z-50 animate-scaleUp origin-top-right overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30">
                      {unreadCount} new
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      0 unread
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {notifications.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-2">
                    <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-400 w-fit mx-auto">
                      <Bell className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">All Caught Up!</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      No active alerts or notifications in your queue.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markOneAsRead(n.id, n.tabLink)}
                      className={`p-3.5 flex items-start space-x-3 transition-colors cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        !n.read ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {getNotificationIcon(n.type)}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs truncate ${!n.read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{n.time}</span>
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                          {n.description}
                        </p>

                        {n.tabLink && (
                          <div className="flex items-center space-x-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>Open view</span>
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-center space-y-2 pt-0.5 flex-shrink-0">
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-white dark:ring-slate-900"></span>
                        )}
                        <button
                          onClick={(e) => removeNotification(e, n.id)}
                          className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                          title="Dismiss notification"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400 px-2">{notifications.length} alerts</span>
                  <button
                    onClick={clearAllNotifications}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear all</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

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
