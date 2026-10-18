import React, { useEffect, useRef, useState } from 'react';
import { Bot, Bell, ShieldCheck, Sparkles, CheckCheck, Trash2, Briefcase, X, ChevronRight } from 'lucide-react';

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

interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export const NotificationBell: React.FC<Props> = ({ open: notificationsOpen, onToggle, onClose, onNavigate }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem('applyflow_notifications');
      return saved ? JSON.parse(saved) : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  });

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
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOneAsRead = (id: string, tabLink?: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (tabLink) {
      onNavigate(tabLink);
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
    <div className="relative" ref={notificationRef}>
      <button
        type="button"
        onClick={() => {
          onToggle();
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
                      <p
                        className={`text-xs truncate ${!n.read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}
                      >
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
                      aria-label="Close"
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
  );
};
