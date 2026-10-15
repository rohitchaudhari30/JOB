import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveTelemetryPanel } from '../components/LiveTelemetryPanel';
import { TimelineEvent } from '../types';

describe('LiveTelemetryPanel Real-Time Tracker', () => {
  const mockEvents: TimelineEvent[] = [
    {
      run_id: 'run_1',
      event_name: 'DISCOVERY_COMPLETED',
      state: 'DISCOVERING',
      message: 'Discovered 7 jobs (2 new, 5 existing).',
      stats: { discovered: 7, matched: 0, applied: 0 },
      timestamp: '2026-10-08T14:18:07Z',
    },
    {
      run_id: 'run_1',
      event_name: 'JOB_EVALUATED',
      state: 'MATCHING',
      message: 'Evaluated [Python lead (AWS + Agentic AI)( 9+ Years) Python lead (AWS + Agentic AI)( 9+ Years) at NSR Information Systems]: Score 55.6% -> REJECT',
      payload: {
        score: 55.6,
        decision: 'REJECT',
        job_title: 'Python lead (AWS + Agentic AI)( 9+ Years) Python lead (AWS + Agentic AI)( 9+ Years)',
        company: 'NSR Information Systems',
        platform: 'naukri',
        matched_skills: ['Python'],
        missing_skills: ['AWS', 'Agentic AI'],
        reasoning: 'Score 55.6% below minimum 75.0% threshold.',
      },
      timestamp: '2026-10-08T14:18:08Z',
    },
    {
      run_id: 'run_1',
      event_name: 'APPLICATION_SUBMITTED',
      state: 'APPLYING',
      message: 'Application submitted successfully for [Senior Data Engineer at CloudScale Tech].',
      payload: {
        score: 91.2,
        job_title: 'Senior Data Engineer',
        company: 'CloudScale Tech',
        platform: 'linkedin',
        application_id: 'app_123',
      },
      timestamp: '2026-10-08T14:22:15Z',
    },
  ];

  it('renders all events by default and displays category tabs', () => {
    render(
      <LiveTelemetryPanel
        events={mockEvents}
        activeRun={null}
        currentExecutionState="IDLE"
      />
    );

    // Header has event count
    expect(screen.getByText(/3 events/i)).toBeDefined();

    // Cleaned job title without duplicated string
    expect(screen.getByText('Python lead (AWS + Agentic AI)( 9+ Years)')).toBeDefined();

    // Company names visible
    expect(screen.getByText('NSR Information Systems')).toBeDefined();
    expect(screen.getByText('CloudScale Tech')).toBeDefined();

    // Filter tabs exist with counts
    expect(screen.getByRole('button', { name: /all \(3\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /applied \(1\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /matches \(1\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /scanned \(1\)/i })).toBeDefined();
  });

  it('filters to only applied jobs when clicking Applied tab', () => {
    render(
      <LiveTelemetryPanel
        events={mockEvents}
        activeRun={null}
        currentExecutionState="IDLE"
      />
    );

    const appliedTab = screen.getByRole('button', { name: /applied \(1\)/i });
    fireEvent.click(appliedTab);

    // Applied job is visible
    expect(screen.getByText('CloudScale Tech')).toBeDefined();
    expect(screen.getByText(/submission confirmed/i)).toBeDefined();

    // Rejected match is filtered out
    expect(screen.queryByText('NSR Information Systems')).toBeNull();
  });

  it('filters to only matches when clicking Matches tab', () => {
    render(
      <LiveTelemetryPanel
        events={mockEvents}
        activeRun={null}
        currentExecutionState="IDLE"
      />
    );

    const matchesTab = screen.getByRole('button', { name: /matches \(1\)/i });
    fireEvent.click(matchesTab);

    // Evaluated job is visible with score badge and missing skills
    expect(screen.getByText('NSR Information Systems')).toBeDefined();
    expect(screen.getByText(/55.6% REJECT/i)).toBeDefined();
    expect(screen.getByText('-AWS')).toBeDefined();

    // Applied job is filtered out
    expect(screen.queryByText('CloudScale Tech')).toBeNull();
  });

  it('renders active HUD and 5-stage stepper when run is active', () => {
    render(
      <LiveTelemetryPanel
        events={mockEvents}
        activeRun={{
          run_id: 'run_active',
          user_id: 'usr_1',
          status: 'RUNNING',
          active_state: 'APPLYING',
          current_job_title: 'Senior Data Engineer @ CloudScale Tech',
          applications_submitted_count: 1,
          discovered_jobs_count: 7,
          matched_jobs_count: 1,
          is_paused: false,
          created_at: '2026-10-08T14:00:00Z',
        }}
        currentExecutionState="APPLYING"
      />
    );

    // Active state banner
    expect(screen.getByText(/live automation active/i)).toBeDefined();
    expect(screen.getByText(/active target:/i)).toBeDefined();

    // 5-stage stepper
    expect(screen.getByText('1. Discover')).toBeDefined();
    expect(screen.getByText('2. AI Match')).toBeDefined();
    expect(screen.getByText('3. Navigate')).toBeDefined();
    expect(screen.getByText('4. Form Fill')).toBeDefined();
    expect(screen.getByText('5. Submitted')).toBeDefined();
  });

  it('triggers onNavigate when clicking View in CRM', () => {
    const onNavigate = vi.fn();
    render(
      <LiveTelemetryPanel
        events={mockEvents}
        activeRun={null}
        currentExecutionState="IDLE"
        onNavigate={onNavigate}
      />
    );

    const viewCrmBtn = screen.getByRole('button', { name: /view in crm/i });
    fireEvent.click(viewCrmBtn);

    expect(onNavigate).toHaveBeenCalledWith('crm');
  });
});
