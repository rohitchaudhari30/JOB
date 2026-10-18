import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const ToastBanner: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => (
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
    <button aria-label="Close" onClick={() => onClose()} className="ml-2 hover:opacity-75 cursor-pointer">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);
