import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewCampaignModal } from '../pages/campaigns/NewCampaignModal';
import { ScreenshotModal } from '../pages/applications/ScreenshotModal';
import { ReconciliationModal } from '../pages/applications/ReconciliationModal';
import { RationaleModal } from '../pages/applications/RationaleModal';

const app: any = { id: 'a1', job_id: 'j1', workflow_state: 'RECONCILIATION_REQUIRED', job_title: 'Data Engineer', company: 'Acme' };

describe('migrated modals use the shared Modal', () => {
  it('NewCampaignModal: dialog, labelled input, submit via footer button, Esc closes', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<NewCampaignModal name="Spring" busy={false} onNameChange={() => {}} onSubmit={onSubmit} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /create automation campaign/i })).toBeTruthy();
    expect(screen.getByLabelText(/campaign name/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create campaign/i }));
    expect(onSubmit).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('NewCampaignModal cannot be dismissed while busy', () => {
    const onClose = vi.fn();
    render(<NewCampaignModal name="x" busy onNameChange={() => {}} onSubmit={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ScreenshotModal: shows the path and closes on Esc', () => {
    const onClose = vi.fn();
    render(<ScreenshotModal appId="a1" path="/tmp/x.png" imageUrl={null} loading={false} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /screenshot/i })).toBeTruthy();
    expect(screen.getByText(/\/tmp\/x\.png/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ReconciliationModal: dialog with the three actions; dismiss action fires', () => {
    const onAction = vi.fn();
    render(<ReconciliationModal app={app} notes="" busy={false} onNotesChange={() => {}} onAction={onAction} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /submission outcome verification/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onAction).toHaveBeenCalledWith('DISMISS');
  });

  it('RationaleModal: dialog and Esc closes', () => {
    const onClose = vi.fn();
    render(
      <RationaleModal app={app} score={70} status={{ label: 'Pending', className: '' }} experienceLabel="2-5 Yrs" onClose={onClose} onApprove={() => {}} onRetry={() => {}} />
    );
    expect(screen.getByRole('dialog', { name: /decision rationale/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal initial focus', () => {
  it('focuses the [data-autofocus] field instead of the close button', () => {
    render(<NewCampaignModal name="" busy={false} onNameChange={() => {}} onSubmit={() => {}} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText(/campaign name/i));
  });
});
