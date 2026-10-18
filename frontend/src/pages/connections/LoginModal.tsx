import React from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

export const LoginModal: React.FC<{ activeModal: { platform: string; name: string } | null }> = ({ activeModal }) => (
  <Modal
    open={Boolean(activeModal)}
    onClose={() => {}}
    title={`Connecting to ${activeModal?.name ?? ''}`}
    widthClass="max-w-md"
    dismissible={false}
  >
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-500/20">
        <KeyRound className="w-6 h-6 animate-pulse" aria-hidden="true" />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        A secure browser window has opened on your screen. Please enter your credentials and solve any 2FA/OTP directly
        on the portal.
      </p>
      <div
        role="status"
        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-400 flex items-center space-x-2"
      >
        <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" aria-hidden="true" />
        <span>Awaiting login completion in browser window...</span>
      </div>
      <p className="text-[10px] text-slate-500">
        Once you log in, the browser window will close automatically and your session will be encrypted.
      </p>
    </div>
  </Modal>
);
