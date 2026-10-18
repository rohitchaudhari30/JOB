import React, { createContext, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = (message: string, type: ToastType = 'info', title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, type, title, message };
    setToasts((prev) => [...prev.slice(-4), newToast]); // Keep up to 5 toasts

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const showSuccess = (message: string, title?: string) => showToast(message, 'success', title || 'Success');
  const showError = (message: string, title?: string) => showToast(message, 'error', title || 'Action Failed');
  const showInfo = (message: string, title?: string) => showToast(message, 'info', title || 'Notice');
  const showWarning = (message: string, title?: string) => showToast(message, 'warning', title || 'Warning');

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, showWarning }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-4 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 animate-fadeIn flex items-start space-x-3 ${
              t.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/40 text-white dark:bg-slate-900 dark:border-emerald-500/50'
                : t.type === 'error'
                ? 'bg-slate-900/95 border-rose-500/40 text-white dark:bg-slate-900 dark:border-rose-500/50'
                : t.type === 'warning'
                ? 'bg-slate-900/95 border-amber-500/40 text-white dark:bg-slate-900 dark:border-amber-500/50'
                : 'bg-slate-900/95 border-indigo-500/40 text-white dark:bg-slate-900 dark:border-indigo-500/50'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {t.type === 'info' && <Info className="w-5 h-5 text-indigo-400" />}
            </div>

            <div className="flex-1 space-y-0.5">
              {t.title && <div className="text-xs font-black tracking-wide text-white">{t.title}</div>}
              <div className="text-xs text-slate-300 leading-relaxed">{t.message}</div>
            </div>

            <button type="button" aria-label="Close"
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
