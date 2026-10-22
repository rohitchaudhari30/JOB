import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TailorResumeDialog } from '../pages/jobs/tailor/TailorResumeDialog';
import { pickResumable } from '../pages/jobs/tailor/tailorLogic';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    listResumes: vi.fn(),
    listTailoredForJob: vi.fn(),
    listSavedTailored: vi.fn().mockResolvedValue([]),
    startTailoring: vi.fn(),
    getTailored: vi.fn(),
    answerTailoring: vi.fn(),
    generateTailored: vi.fn(),
    saveTailored: vi.fn(),
    cancelTailored: vi.fn(),
    discardTailored: vi.fn(),
    downloadTailored: vi.fn(),
  },
}));

const base: any = {
  id: 't1', mode: 'EDIT', job_id: 'j1', version: 1, approved_edit_ids: [],
  has_file: false, has_pdf: false,
};
const edit: any = {
  id: 'e1', type: 'REWORD', category: 'A', block_id: 'body:3', before: 'Built dashboards', after: 'Built analytics dashboards',
  reason: 'Job asks for analytics', evidence: [{ quote: 'Built dashboards' }],
};
const m = api as any;

const renderDialog = () => render(<TailorResumeDialog open jobId="j1" jobTitle="Analyst" onClose={() => {}} />);

describe('TailorResumeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.listTailoredForJob.mockResolvedValue([]);
  });

  it('starts from the setup step with the default resume', async () => {
    m.listResumes.mockResolvedValue([{ id: 'r1', label: 'Main', is_default: true, file_name: 'cv.docx' }]);
    m.startTailoring.mockResolvedValue({ ...base, status: 'QUEUED' });
    m.getTailored.mockResolvedValue({ ...base, status: 'QUEUED' });
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /analyse this job/i }));
    await waitFor(() => expect(m.startTailoring).toHaveBeenCalledWith('j1', 'r1'));
    expect((await screen.findByRole('status')).textContent).toMatch(/reading your resume/i);
  });

  it('asks the user to upload a resume when there is none', async () => {
    m.listResumes.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByRole('link', { name: /upload a resume/i })).toBeTruthy();
  });

  it('resumes an existing review and offers save, download and discard', async () => {
    m.listTailoredForJob.mockResolvedValue([
      { ...base, status: 'READY_FOR_REVIEW', has_file: true, approved_edit_ids: ['e1'],
        edit_plan: { edits: [edit], suggestions: [], rejected: [] },
        validation: { passed: true, applied: ['e1'], skipped: [], checks: [{ name: 'opens', status: 'pass', detail: '' }] } },
    ]);
    m.saveTailored.mockResolvedValue({ ...base, status: 'SAVED', has_file: true, validation: { passed: true, applied: [], skipped: [], checks: [] } });
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /save for this job/i }));
    await waitFor(() => expect(m.saveTailored).toHaveBeenCalledWith('t1'));
    expect(screen.getByRole('button', { name: /download word/i })).toBeTruthy();
  });

  it('shows the server message and a restart when a request fails', async () => {
    m.listResumes.mockResolvedValue([{ id: 'r1', label: 'Main', is_default: true, file_name: 'cv.docx' }]);
    m.startTailoring.mockResolvedValue({ ...base, status: 'QUEUED' });
    m.getTailored.mockResolvedValue({ ...base, status: 'FAILED', error_message: 'The job description is too short.' });
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: /analyse this job/i }));
    expect(await screen.findByText(/job description is too short/i, {}, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /start again/i }));
    expect(await screen.findByRole('button', { name: /analyse this job/i })).toBeTruthy();
  });
});

describe('pickResumable', () => {
  it('skips dead ends and returns the first live request', () => {
    const list: any[] = [{ id: 'a', status: 'FAILED' }, { id: 'b', status: 'SAVED' }, { id: 'c', status: 'AWAITING_INPUT' }];
    expect(pickResumable(list)?.id).toBe('b');
    expect(pickResumable([{ id: 'a', status: 'DISCARDED' } as any])).toBeNull();
  });
});

describe('nested modals', () => {
  it('Escape closes only the innermost modal', async () => {
    const { Modal } = await import('../components/ui/Modal');
    const outer = vi.fn();
    const inner = vi.fn();
    const ui = (innerOpen: boolean) => (
      <Modal open onClose={outer} title="Outer">
        <button>a</button>
        <Modal open={innerOpen} onClose={inner} title="Inner"><button>b</button></Modal>
      </Modal>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true)); // the inner dialog opens from inside the outer one
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('saved copies on cards, in the application panel and in settings', () => {
  const saved = [{ id: 't9', job_id: 'j1', job_title: 'Analyst', company: 'Acme', master_label: 'Main', file_name: 'cv-tailored.docx', has_pdf: false, approved_at: '2026-10-01T10:00:00Z' }];

  beforeEach(async () => {
    const store = await import('../pages/jobs/tailor/savedTailoredStore');
    store.resetSavedTailoredForTests();
  });

  it('the card button says Tailored ✓ when a copy is saved for that job', async () => {
    m.listSavedTailored = vi.fn().mockResolvedValue(saved);
    const { TailorButton } = await import('../pages/jobs/tailor/TailorButton');
    render(<TailorButton jobId="j1" jobTitle="Analyst" />);
    expect(await screen.findByRole('button', { name: /tailored ✓/i })).toBeTruthy();
    render(<TailorButton jobId="other" jobTitle="Other" />);
    expect((await screen.findAllByRole('button', { name: /^tailor resume$/i })).length).toBe(1);
  });

  it('the application panel offers the switch only when a copy exists and the state allows it', async () => {
    m.listSavedTailored = vi.fn().mockResolvedValue(saved);
    const { ApplicationDrawer } = await import('../pages/applications/ApplicationDrawer');
    const onChoice = vi.fn();
    const view: any = { title: 'Analyst', company: 'Acme', platform: 'x', statusLabel: 'Approved', needsVerification: false };
    const app: any = { id: 'a1', job_id: 'j1', workflow_state: 'APPROVED', tailored_resume_id: 't9', created_at: '2026-10-01T10:00:00Z', questions: [] };
    const { rerender } = render(<ApplicationDrawer app={app} view={view} onClose={() => {}} onRationale={() => {}} onScreenshot={() => {}} onReconcile={() => {}} onResumeChoice={onChoice} />);
    fireEvent.click(await screen.findByRole('button', { name: /send master resume instead/i }));
    expect(onChoice).toHaveBeenCalledWith(app, false);

    const sent: any = { ...app, workflow_state: 'APPLIED' };
    rerender(<ApplicationDrawer app={sent} view={view} onClose={() => {}} onRationale={() => {}} onScreenshot={() => {}} onReconcile={() => {}} onResumeChoice={onChoice} />);
    expect(screen.queryByRole('button', { name: /send master resume instead/i })).toBeNull();
  });

  it('settings lists saved copies and removes one after confirmation', async () => {
    m.listSavedTailored = vi.fn().mockResolvedValueOnce(saved).mockResolvedValue([]);
    m.discardTailored.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { ToastProvider } = await import('../context/ToastContext');
    const { TailoredResumesSection } = await import('../pages/profile/TailoredResumesSection');
    render(<ToastProvider><TailoredResumesSection /></ToastProvider>);
    expect(await screen.findByText(/Analyst · Acme/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(m.discardTailored).toHaveBeenCalledWith('t9'));
    expect(await screen.findByText(/none yet/i)).toBeTruthy();
  });
});
