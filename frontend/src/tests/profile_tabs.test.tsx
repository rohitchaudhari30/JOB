import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../context/ToastContext';

const api = {
  deleteResume: vi.fn(),
  listResumes: vi.fn(),
  setDefaultResume: vi.fn(),
  saveSavedAnswer: vi.fn(),
  listSavedAnswers: vi.fn(),
};
vi.mock('../services/api', () => ({ api: new Proxy({}, { get: (_t, k: string) => (api as any)[k] }) }));

import { ResumeLibraryTab } from '../pages/profile/ResumeLibraryTab';
import { SavedAnswersTab } from '../pages/profile/SavedAnswersTab';

const resume: any = {
  id: 'r1',
  label: 'Backend CV',
  file_name: 'cv.pdf',
  is_default: true,
  target_role: 'Engineer',
  created_at: '2026-10-01T00:00:00Z',
};

describe('ResumeLibraryTab', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('shows the document count and deletes after confirmation, reporting the refreshed list', async () => {
    api.deleteResume.mockResolvedValue(undefined);
    api.listResumes.mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onResumesChange = vi.fn();
    render(
      <ToastProvider>
        <ResumeLibraryTab resumes={[resume]} onResumesChange={onResumesChange} defaultTargetRole="Engineer" />
      </ToastProvider>
    );
    expect(screen.getByText('1 document')).toBeDefined();
    fireEvent.click(screen.getByTitle(/delete/i));
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onResumesChange).toHaveBeenCalledWith([]));
  });

  it('does not delete when the user cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ToastProvider>
        <ResumeLibraryTab resumes={[resume]} onResumesChange={vi.fn()} defaultTargetRole="" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByTitle(/delete/i));
    expect(api.deleteResume).not.toHaveBeenCalled();
  });
});

describe('SavedAnswersTab', () => {
  it('renders without answers', () => {
    render(
      <ToastProvider>
        <SavedAnswersTab savedAnswers={[]} onChange={vi.fn()} />
      </ToastProvider>
    );
    expect(screen.getAllByRole('button', { name: /save/i }).length).toBeGreaterThan(0);
  });
});
