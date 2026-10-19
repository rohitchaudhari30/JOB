import React, { useState } from 'react';
import { Download, KeyRound, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const MIN_PASSWORD_LENGTH = 8;

/** Why the change-password form cannot be submitted yet, or null when it can. */
export function passwordFormProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < MIN_PASSWORD_LENGTH) return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next === current) return 'Choose a password different from the current one.';
  if (next !== confirm) return 'The two new passwords do not match.';
  return null;
}

interface AccountSettingsProps {
  onPasswordChanged: (accessToken: string) => void;
  onAccountDeleted: () => void;
}

const card = 'p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4';
const input =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500';
const label = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5';

export const AccountSettings: React.FC<AccountSettingsProps> = ({ onPasswordChanged, onAccountDeleted }) => {
  const { showSuccess, showError } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changing, setChanging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const problem = passwordFormProblem(current, next, confirm);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setChanging(true);
    try {
      const res = await api.changePassword(current, next);
      onPasswordChanged(res.access_token); // this device stays signed in; every other session is ended
      setCurrent('');
      setNext('');
      setConfirm('');
      showSuccess('Password changed. Other devices have been signed out.');
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Could not change the password.');
    } finally {
      setChanging(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const blob = await api.exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data.json';
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Your data was downloaded.');
    } catch {
      showError('Could not export your data.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
      setConfirmOpen(false);
      onAccountDeleted();
    } catch (err: any) {
      setConfirmOpen(false);
      showError(err.response?.data?.detail || 'Could not delete the account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-2xl">
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Account</h1>
      <section className={card} aria-labelledby="pw-heading">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-500" aria-hidden="true" />
          <h2 id="pw-heading" className="text-sm font-bold text-slate-800 dark:text-slate-100">Change password</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Changing your password signs you out everywhere else. This device stays signed in.
        </p>
        <form onSubmit={changePassword} className="space-y-3" noValidate>
          <div>
            <label htmlFor="pw-current" className={label}>Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" className={input} value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pw-new" className={label}>New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" className={input} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pw-confirm" className={label}>Repeat new password</label>
            <input id="pw-confirm" type="password" autoComplete="new-password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {problem && (current || next || confirm) && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{problem}</p>
          )}
          <Button type="submit" variant="primary" size="sm" loading={changing} disabled={problem !== null}>
            Change password
          </Button>
        </form>
      </section>

      <section className={card} aria-labelledby="export-heading">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-500" aria-hidden="true" />
          <h2 id="export-heading" className="text-sm font-bold text-slate-800 dark:text-slate-100">Download my data</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          One JSON file with your profile, resumes (records only), answers, matches, applications and campaigns. It never
          includes your password, login tokens or saved platform sessions.
        </p>
        <Button variant="secondary" size="sm" loading={exporting} onClick={() => void exportData()}>
          Download my data
        </Button>
      </section>

      <section className={`${card} border-red-200 dark:border-red-900/60`} aria-labelledby="delete-heading">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
          <h2 id="delete-heading" className="text-sm font-bold text-red-700 dark:text-red-400">Delete my account</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Permanently deletes your account and everything stored about you: profile, resumes, matches, applications,
          campaigns and platform sessions. This cannot be undone.
        </p>
        <div>
          <label htmlFor="delete-password" className={label}>Your password</label>
          <input id="delete-password" type="password" autoComplete="current-password" className={input} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
        </div>
        <Button variant="danger" size="sm" disabled={!deletePassword} onClick={() => setConfirmOpen(true)}>
          Delete my account
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        message="All of your data will be erased and you will be signed out. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        busy={deleting}
        onConfirm={() => void deleteAccount()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
