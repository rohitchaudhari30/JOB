import React from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface NewCampaignModalProps {
  name: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const FORM_ID = 'new-campaign-form';

export const NewCampaignModal: React.FC<NewCampaignModalProps> = ({ name, busy, onNameChange, onSubmit, onClose }) => (
  <Modal
    open
    onClose={onClose}
    title="Create automation campaign"
    widthClass="max-w-md"
    dismissible={!busy}
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{busy ? 'Creating…' : 'Create campaign'}</span>
        </Button>
      </>
    }
  >
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-1.5">
      <p className="text-xs text-slate-600 dark:text-slate-400">Define a target-role campaign with its own pacing.</p>
      <label htmlFor="new-campaign-name" className="block text-xs font-bold text-slate-700 dark:text-slate-300 pt-2">
        Campaign name
      </label>
      <input
        id="new-campaign-name"
        data-autofocus
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="e.g. Senior Backend Engineer - Spring 2026"
        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
        required
      />
    </form>
  </Modal>
);
