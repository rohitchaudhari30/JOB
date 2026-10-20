import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LiveAutomation } from '../pages/LiveAutomation';
import { ToastProvider } from '../context/ToastContext';

const api = { pauseRun: vi.fn(), resumeRun: vi.fn(), stopRun: vi.fn(), getProfile: vi.fn(), startAutomation: vi.fn(), getRunEvents: vi.fn().mockResolvedValue([]) };
vi.mock('../services/api', () => ({ api: new Proxy({}, { get: (_t, k: string) => (api as any)[k] }) }));
vi.mock('../services/ws', () => ({
  wsClient: {
    onBinaryFrame: vi.fn(() => () => {}), onFrame: vi.fn(() => () => {}), onNavigation: vi.fn(() => () => {}),
    onTimelineEvent: vi.fn(() => () => {}), onEvent: vi.fn(() => () => {}), onMessage: vi.fn(() => () => {}),
    onExecutionState: vi.fn(() => () => {}), sendCommand: vi.fn(),
  },
}));

const run = (over: object = {}): any => ({
  run_id: 'r1', user_id: 'u', status: 'RUNNING', active_state: 'RUNNING', is_paused: false,
  discovered_jobs_count: 0, matched_jobs_count: 0, applications_submitted_count: 0, created_at: '2026-10-01T00:00:00Z', ...over,
});

const renderLive = (activeRun: any, onRefresh = vi.fn()) =>
  render(<ToastProvider><LiveAutomation activeRun={activeRun} onRefreshStatus={onRefresh} /></ToastProvider>);

beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.getRunEvents.mockResolvedValue([]); });

describe('Live run controls', () => {
  it('Stop run asks for confirmation and only stops after confirming', async () => {
    api.stopRun.mockResolvedValue(undefined);
    renderLive(run());
    fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));
    expect(api.stopRun).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Stop this run?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.stopRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop run' }).pop()!);
    await waitFor(() => expect(api.stopRun).toHaveBeenCalledWith('r1'));
  });

  it('shows the paused banner only while paused, and "Enter code" opens the code dialog', () => {
    const { unmount } = renderLive(run());
    expect(screen.queryByText('This run is paused')).toBeNull();
    unmount();
    renderLive(run({ is_paused: true }));
    expect(screen.getByText('This run is paused')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume run' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enter code' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('tells the person when pausing fails instead of failing silently', async () => {
    api.pauseRun.mockRejectedValue({ response: { data: { detail: 'Run not found' } } });
    renderLive(run());
    fireEvent.click(screen.getByRole('button', { name: 'Pause run' }));
    expect(await screen.findByText(/Could not pause the run: Run not found/)).toBeTruthy();
  });
});
