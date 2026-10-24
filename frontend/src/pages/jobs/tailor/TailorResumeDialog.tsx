import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Maximize2, Minimize2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../services/api';
import { SetupStep } from './SetupStep';
import { NextRaiseStep1 } from './NextRaiseStep1';
import { NextRaiseStep2 } from './NextRaiseStep2';
import { NextRaiseStep3 } from './NextRaiseStep3';
import { AnalysisStep } from './AnalysisStep';
import { useTailoring } from './useTailoring';
import { saveBlob, workingText, cleanResumeFileName } from './tailorLogic';
import { refreshSavedTailored } from './savedTailoredStore';
import { useToast } from '../../../context/ToastContext';

interface Props {
  open: boolean;
  jobId: string;
  jobTitle: string;
  applyUrl?: string;
  onClose: () => void;
  onChanged?: () => void;
}

export const TailorResumeDialog: React.FC<Props> = ({ open, jobId, jobTitle, applyUrl = '', onClose, onChanged }) => {
  const { showError } = useToast();
  const t = useTailoring(jobId);
  const { item, error, busy, working, loadingExisting, loadExisting } = t;
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      void loadExisting();
    }
  }, [open, loadExisting]);

  useEffect(() => {
    if (item?.status === 'READY_FOR_REVIEW' || item?.status === 'SAVED') {
      setCurrentStep(3);
    }
  }, [item?.status]);

  const download = async (format: 'docx' | 'pdf') => {
    if (!item) return;
    try {
      const blob = await api.downloadTailored(item.id, format);
      const personal = item.analysis?.nextraise?.structured_resume?.personal;
      const candidate = personal && (personal.first_name || personal.last_name)
        ? `${personal.first_name ?? ''} ${personal.last_name ?? ''}`.trim()
        : (jobTitle ? `${jobTitle.replace(/[^a-zA-Z0-9]+/g, '_')}_Candidate` : 'Resume');
      const cleanName = cleanResumeFileName(item.file_name, candidate, format);
      saveBlob(blob, cleanName);
    } catch (e: any) {
      showError(e?.response?.data?.detail || e?.message || 'Failed to download tailored resume. Please try again.');
    }
  };

  const handleSave = async () => {
    await t.save();
    await refreshSavedTailored();
    onChanged?.();
  };

  const handleGenerate = (sections: string[], keywords: string[]) => {
    const edits = item?.edit_plan?.edits ?? [];
    const activeKeywordsSet = new Set(keywords.map((k) => k.toLowerCase().trim()));
    const activeSectionsSet = new Set(sections.map((s) => s.toLowerCase().trim()));

    // Filter edits according to active keyword and section toggles
    const filteredEdits = edits.filter((e) => {
      const req = (e.requirement || '').toLowerCase().trim();
      const matchesKeyword =
        activeKeywordsSet.size === 0 ||
        !req ||
        activeKeywordsSet.has(req) ||
        [...activeKeywordsSet].some((k) => req.includes(k) || k.includes(req));

      const block = (e.block_id || '').toLowerCase();
      const before = (e.before || '').toLowerCase();
      let section = 'experience';
      if (block.includes('summary') || before.includes('summary')) section = 'summary';
      else if (block.includes('skill') || before.includes('skill')) section = 'skills';
      else if (block.includes('project') || before.includes('project')) section = 'projects';

      const matchesSection = activeSectionsSet.size === 0 || activeSectionsSet.has(section);
      return matchesKeyword && matchesSection;
    });

    const chosenIds = filteredEdits.map((e) => e.id);
    const allIds = edits.map((e) => e.id);
    const finalIds = chosenIds.length > 0 ? chosenIds : (allIds.length > 0 ? allIds : ['e1']);
    void t.generate(finalIds);
    setCurrentStep(3);
  };

  const status = item?.status;
  const deadEnd =
    item &&
    (status === 'FAILED' || status === 'CANCELLED' || status === 'DISCARDED' || status === 'STALE');

  let body: React.ReactNode;
  if (loadingExisting) {
    body = (
      <div className="flex items-center justify-center space-x-2 py-12 text-xs text-slate-500 dark:text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <span>Loading existing tailoring session…</span>
      </div>
    );
  } else if (!item) {
    body = (
      <SetupStep
        busy={busy}
        needsDescription={error?.code === 'JOB_DESCRIPTION_TOO_SHORT'}
        onStart={t.start}
        jobTitle={jobTitle}
        applyUrl={applyUrl}
      />
    );
  } else if (working) {
    body = (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-4">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-indigo-500/20" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <Sparkles className="h-5 w-5 animate-pulse" />
          </div>
        </div>
        <div className="space-y-1">
          <h4 role="status" className="text-sm font-bold text-slate-900 dark:text-white">
            {workingText(item.status)}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Comparing role requirements with career evidence. Process continues in background if closed.
          </p>
        </div>
        <div className="pt-2">
          <Button size="sm" variant="ghost" onClick={() => void t.cancel()} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (deadEnd) {
    body = (
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
        <p role="alert" className="text-xs font-medium text-slate-800 dark:text-slate-200">
          {item.error_message ||
            (status === 'STALE' ? 'Posting or master resume updated. Please regenerate.' : 'The tailoring process did not finish.')}
        </p>
        <Button variant="primary" size="sm" onClick={t.reset}>
          Start again
        </Button>
      </div>
    );
  } else if (item.mode === 'SUGGESTIONS_ONLY' && status === 'AWAITING_INPUT') {
    body = <AnalysisStep item={item} busy={busy} onAnswer={(a) => void t.answer(a)} onGenerate={() => {}} />;
  } else if (currentStep === 1) {
    body = <NextRaiseStep1 item={item} onContinue={() => setCurrentStep(2)} />;
  } else if (currentStep === 2) {
    body = <NextRaiseStep2 item={item} busy={busy} onBack={() => setCurrentStep(1)} onGenerate={handleGenerate} />;
  } else {
    body = (
      <NextRaiseStep3
        item={item}
        onBack={() => setCurrentStep(2)}
        onSave={handleSave}
        onDownload={download}
        busy={busy}
      />
    );
  }

  const widthClass = !item
    ? 'w-full max-w-2xl'
    : isExpanded
    ? 'w-full'
    : 'w-full lg:w-[92vw] xl:w-[88vw] 2xl:w-[82vw] max-w-7xl';

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="right"
      title={`Optimize Resume · ${jobTitle}`}
      widthClass={widthClass}
      dismissible={!busy}
      headerActions={
        item ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse to side panel' : 'Expand to full studio'}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span className="hidden sm:inline text-[11px]">Side Panel</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                <span className="hidden sm:inline text-[11px]">Full Screen</span>
              </>
            )}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col min-h-full flex-1 space-y-5">
        {/* NextRaise Stepper Bar */}
        {item && !deadEnd && !working && item.mode !== 'SUGGESTIONS_ONLY' && (
          <div className="flex items-center justify-center gap-6 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
            {/* Step 1 */}
            <div className={`flex items-center gap-2 font-semibold ${currentStep === 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${currentStep > 1 ? 'bg-emerald-600 text-white' : currentStep === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700'}`}>
                {currentStep > 1 ? <Check className="h-3 w-3" /> : '1'}
              </span>
              <span>See your difference</span>
            </div>

            <div className="h-px w-8 bg-slate-200 dark:bg-slate-800" />

            {/* Step 2 */}
            <div className={`flex items-center gap-2 font-semibold ${currentStep === 2 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${currentStep > 2 ? 'bg-emerald-600 text-white' : currentStep === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700'}`}>
                {currentStep > 2 ? <Check className="h-3 w-3" /> : '2'}
              </span>
              <span>Align your resume</span>
            </div>

            <div className="h-px w-8 bg-slate-200 dark:bg-slate-800" />

            {/* Step 3 */}
            <div className={`flex items-center gap-2 font-semibold ${currentStep === 3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${currentStep === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700'}`}>
                3
              </span>
              <span>Review your new resume</span>
            </div>
          </div>
        )}

        {body}
      </div>
    </Modal>
  );
};
