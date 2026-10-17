import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export const OtpModal: React.FC<Props> = ({ open, onClose, value, onChange, onSubmit }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Verification challenge detected"
    widthClass="max-w-md"
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
        <Button variant="primary" onClick={onSubmit}>
          Submit code &amp; resume auto-apply
        </Button>
      </>
    }
  >
    <div className="space-y-4">
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        The portal needs an OTP or CAPTCHA confirmation. The automation engine has safely paused. Enter the code sent to
        your registered phone/email, or solve the challenge on the portal.
      </p>
      <div>
        <label htmlFor="otp-code" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
          OTP code / verification token
        </label>
        <input
          id="otp-code"
          data-autofocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 123456"
          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white font-mono text-center tracking-widest text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>
    </div>
  </Modal>
);
