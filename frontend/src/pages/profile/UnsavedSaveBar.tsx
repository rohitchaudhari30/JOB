import React from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface Props {
  dirty: boolean;
  saving: boolean;
  savedSuccess: boolean;
  onSave: () => void;
}

/**
 * Sticky save bar for the Settings pages that edit the candidate profile. It appears as soon as
 * there is something to save, so the Save action is always in reach (no scrolling back to the top).
 */
export const UnsavedSaveBar: React.FC<Props> = ({ dirty, saving, savedSuccess, onSave }) => {
  if (!dirty && !savedSuccess) return null;
  return (
    <div
      role="region"
      aria-label="Save changes"
      className="sticky bottom-3 z-20 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <p role="status" className="min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
        {dirty ? 'You have unsaved changes.' : (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <Check className="h-4 w-4" aria-hidden="true" /> Changes saved
          </span>
        )}
      </p>
      {dirty && (
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Save changes
        </Button>
      )}
    </div>
  );
};
