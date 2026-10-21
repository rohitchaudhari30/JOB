import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TailorResumeDialog } from '../pages/jobs/tailor/TailorResumeDialog';
import { pickResumable } from '../pages/jobs/tailor/tailorLogic';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    listResumes: vi.fn(),
    listTailoredForJob: vi.fn(),
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
