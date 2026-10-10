import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LiveAutomation } from '../pages/LiveAutomation';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/api', () => ({
  api: {
    startAutopilotRun: vi.fn(),
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    stopRun: vi.fn(),
  },
}));

vi.mock('../services/ws', () => ({
  wsClient: {
    onBinaryFrame: vi.fn(() => () => {}),
    onFrame: vi.fn(() => () => {}),
    onNavigation: vi.fn(() => () => {}),
    onTimelineEvent: vi.fn(() => () => {}),
    onEvent: vi.fn(() => () => {}),
    onMessage: vi.fn(() => () => {}),
    onExecutionState: vi.fn(() => () => {}),
    sendCommand: vi.fn(),
  },
}));

describe('LiveAutomation Presentation Controls', () => {
  it('renders Split View by default and allows toggling to Full Viewport', () => {
    render(
      <ToastProvider>
        <LiveAutomation activeRun={null} onRefreshStatus={vi.fn()} />
      </ToastProvider>
    );

    // Initial check: Split View and Full Viewport toggle buttons present
    const splitBtn = screen.getByRole('button', { name: /split view/i });
    const fullBtn = screen.getByRole('button', { name: /full viewport/i });
    expect(splitBtn).toBeDefined();
    expect(fullBtn).toBeDefined();

    // Browser Viewport title is present
    expect(screen.getByText('Browser Viewport')).toBeDefined();
    // Telemetry header is present
    expect(screen.getByText(/telemetry & audit events/i)).toBeDefined();

    // Click "Full Viewport" button
    fireEvent.click(fullBtn);

    // In Full Viewport mode: Restore Split View button appears
    const restoreButtons = screen.getAllByRole('button', { name: /restore split view/i });
    expect(restoreButtons.length).toBeGreaterThan(0);

    // Click "Restore Split View"
    fireEvent.click(restoreButtons[0]);

    // Verifies it restored to Split View
    expect(screen.getByRole('button', { name: /split view/i })).toBeDefined();
  });

  it('toggles full-width view when clicking the header expand button', () => {
    render(
      <ToastProvider>
        <LiveAutomation activeRun={null} onRefreshStatus={vi.fn()} />
      </ToastProvider>
    );

    // 1-click expand button on browser viewport header
    const expandIconBtn = screen.getAllByRole('button', { name: /expand viewport/i })[0];
    expect(expandIconBtn).toBeDefined();

    // Click to expand
    fireEvent.click(expandIconBtn);

    // Now button switches aria-label to 'Restore Split View'
    const restoreIconBtns = screen.getAllByRole('button', { name: /restore split view/i });
    expect(restoreIconBtns.length).toBeGreaterThan(0);
  });
});
