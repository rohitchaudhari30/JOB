import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from '../components/ui/Pagination';
import { ReconciliationModal } from '../pages/applications/ReconciliationModal';

describe('Pagination', () => {
  it('shows the visible range and moves between pages', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={2} pageSize={10} total={35} onPageChange={onPageChange} onPageSizeChange={() => {}} />
    );
    expect(screen.getByText(/Showing 11–20 of 35/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByLabelText('First page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables previous buttons on the first page and shows 0–0 when empty', () => {
    render(<Pagination page={1} pageSize={10} total={0} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByText(/Showing 0–0 of 0/)).toBeTruthy();
    expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true);
  });

  it('only shows the reset link when a handler is given', () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={10} total={5} onPageChange={() => {}} onPageSizeChange={() => {}} />
    );
    expect(screen.queryByText('(Reset filters)')).toBeNull();
    const reset = vi.fn();
    rerender(
      <Pagination page={1} pageSize={10} total={5} onPageChange={() => {}} onPageSizeChange={() => {}} onResetFilters={reset} />
    );
    fireEvent.click(screen.getByText('(Reset filters)'));
    expect(reset).toHaveBeenCalled();
  });
});

describe('ReconciliationModal', () => {
  const app: any = { id: 'a1', job_title: 'Backend Engineer', company: 'Acme', failure_reason: 'timed out' };

  it('sends the chosen resolution and the note field changes', () => {
    const onAction = vi.fn();
    const onNotesChange = vi.fn();
    render(
      <ReconciliationModal app={app} notes="" busy={false} onAction={onAction} onNotesChange={onNotesChange} onClose={() => {}} />
    );
    fireEvent.click(screen.getByText(/Portal Confirmed/));
    expect(onAction).toHaveBeenCalledWith('CONFIRM_SUBMITTED');
    fireEvent.change(screen.getByPlaceholderText(/Checked portal/), { target: { value: 'seen' } });
    expect(onNotesChange).toHaveBeenCalledWith('seen');
  });

  it('blocks every action while a request is running', () => {
    const onAction = vi.fn();
    render(
      <ReconciliationModal app={app} notes="" busy={true} onAction={onAction} onNotesChange={() => {}} onClose={() => {}} />
    );
    fireEvent.click(screen.getByText(/Verified Not Submitted/));
    expect(onAction).not.toHaveBeenCalled();
  });
});
