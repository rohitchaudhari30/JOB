import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignHeader } from '../pages/campaigns/CampaignHeader';
import { CampaignJumpBar, SECTION_IDS } from '../pages/campaigns/CampaignJumpBar';

const camp = (state: string): any => ({ id: 'c1', name: 'Backend roles', state });

const setup = (state: string) => {
  const p = {
    campaigns: [camp(state)], selectedCampaign: camp(state), campaignActionLoading: false,
    syncFormFromCampaign: vi.fn(), setShowNewCampaignModal: vi.fn(),
    handlePauseCampaignExecution: vi.fn(), handleResumeCampaignExecution: vi.fn(),
    handleStopCampaignExecution: vi.fn().mockResolvedValue(undefined),
    handleStartCampaignExecution: vi.fn(), handleSaveCampaignConfig: vi.fn(), setConfirmDelete: vi.fn(),
  };
  render(<CampaignHeader {...p} />);
  return p;
};

describe('Campaign header', () => {
  it('labels every action with its scope', () => {
    setup('RUNNING');
    for (const n of ['Pause campaign', 'Stop campaign', 'Save changes', 'New campaign']) {
      expect(screen.getByRole('button', { name: n }), n).toBeTruthy();
    }
  });

  it('idle campaigns offer Run campaign; paused ones offer Resume campaign', () => {
    const { unmount } = render(<div />); unmount();
    setup('IDLE');
    expect(screen.getByRole('button', { name: 'Run campaign' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop campaign' })).toBeNull();
  });

  it('Stop campaign needs a confirmation before anything is stopped', async () => {
    const p = setup('RUNNING');
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }));
    expect(p.handleStopCampaignExecution).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('Stop this campaign?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.handleStopCampaignExecution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Stop campaign' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(p.handleStopCampaignExecution).toHaveBeenCalledTimes(1));
  });

  it('Delete lives in the More actions menu and is blocked while the campaign is live', () => {
    const p = setup('RUNNING');
    fireEvent.click(screen.getByRole('button', { name: 'More campaign actions' }));
    const item = screen.getByRole('menuitem', { name: /Delete campaign \(stop it first\)/ });
    expect((item as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(item);
    expect(p.setConfirmDelete).not.toHaveBeenCalled();
  });

  it('an idle campaign can be deleted from the menu (still asks to confirm elsewhere)', () => {
    const p = setup('IDLE');
    fireEvent.click(screen.getByRole('button', { name: 'More campaign actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete campaign…' }));
    expect(p.setConfirmDelete).toHaveBeenCalledWith(true);
  });
});

describe('Campaign jump row', () => {
  it('links to all three sections and moves focus to the chosen one', () => {
    render(
      <>
        <CampaignJumpBar logCount={4} />
        {Object.values(SECTION_IDS).map((id) => <section key={id} id={id} tabIndex={-1}>{id}</section>)}
      </>,
    );
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeTruthy();
    const link = screen.getByRole('link', { name: /When & how fast/ });
    fireEvent.click(link);
    expect(document.activeElement?.id).toBe(SECTION_IDS.safety);
    expect(screen.getByRole('link', { name: /Activity/ }).textContent).toContain('(4)');
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
