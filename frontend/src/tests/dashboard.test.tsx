import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from '../pages/Dashboard';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getDashboardOverview: vi.fn(),
    listApplications: vi.fn(),
    listConnections: vi.fn().mockResolvedValue([
      { platform: "naukri", display_name: "Naukri.com", status: "not_connected", session_active: false },
    ]),
    createApplication: vi.fn(),
    pauseRun: vi.fn(),
    resumeRun: vi.fn(),
    stopRun: vi.fn(),
  },
}));

describe('Dashboard (Operational Command Center)', () => {
  const mockOverview = {
    today_applied_count: 8,
    effective_daily_limit: 25,
    quota_remaining: 17,
    quota_percentage: 32.0,
    active_run: {
      is_running: false,
      run_id: null,
      campaign_id: null,
      campaign_name: null,
      status: 'IDLE',
      current_job_title: null,
      current_platform: null,
      progress_percentage: 0.0,
    },
    needs_attention: [],
    readiness: [
      {
        key: 'profile_ready',
        title: 'Target Profile Configured',
        is_ready: true,
        action_label: 'Complete Profile',
        action_url: '/profile',
      },
      {
        key: 'resume_ready',
        title: 'Default Resume Active',
        is_ready: true,
        action_label: 'Upload Resume',
        action_url: '/profile',
      },
    ],
    top_matches: [
      {
        job_id: 'job_123',
        title: 'Staff Fullstack Engineer',
        company: 'Stripe',
        location: 'Remote',
        platform: 'LinkedIn',
        match_score: 94.5,
        decision: 'AUTO_APPLY',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getDashboardOverview as any).mockResolvedValue(mockOverview);
    (api.listApplications as any).mockResolvedValue([]);
  });

  it('renders operational command center header and dynamic quota numbers', async () => {
    const onNavigate = vi.fn();
    render(
      <ToastProvider>
        <Dashboard onNavigate={onNavigate} activeRun={null} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Command Center')).toBeDefined();
      expect(screen.getByText('Applications Today')).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();
      expect(screen.getByText('/ 25')).toBeDefined();
      expect(screen.getByText('17 applications remaining')).toBeDefined();
    });
  });

  it('renders zero operational blockers state when all clear', async () => {
    const onNavigate = vi.fn();
    render(
      <ToastProvider>
        <Dashboard onNavigate={onNavigate} activeRun={null} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Zero Operational Blockers:/)).toBeDefined();
      expect(screen.getByText('Automation Engine Idle')).toBeDefined();
    });
  });

  it('renders high-scoring match card that links to Jobs (no duplicate apply control)', async () => {
    const onNavigate = vi.fn();
    render(
      <ToastProvider>
        <Dashboard onNavigate={onNavigate} activeRun={null} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Staff Fullstack Engineer')).toBeDefined();
      expect(screen.getByText(/Stripe/)).toBeDefined();
      expect(screen.getByText('95% Match')).toBeDefined();
      expect(screen.getByText('Review in Jobs')).toBeDefined();
      expect(screen.queryByText('1-Click Apply')).toBeNull();
    });
  });

  it('renders immediate blocker alert when attention is required', async () => {
    (api.getDashboardOverview as any).mockResolvedValue({
      ...mockOverview,
      needs_attention: [
        {
          id: 'attn_otp_1',
          type: 'PAUSED_OTP',
          title: 'Naukri OTP Verification Required',
          description: 'A 6-digit OTP was sent to your phone to authenticate session.',
          action_label: 'Enter OTP',
          action_url: '/live_console',
          severity: 'CRITICAL',
        },
      ],
    });

    const onNavigate = vi.fn();
    render(
      <ToastProvider>
        <Dashboard onNavigate={onNavigate} activeRun={null} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Immediate Action Required (1)')).toBeDefined();
      expect(screen.getByText('Naukri OTP Verification Required')).toBeDefined();
      expect(screen.getByText('Enter OTP')).toBeDefined();
    });
  });
});
