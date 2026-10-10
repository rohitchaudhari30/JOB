import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { Analytics } from '../pages/Analytics';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getFunnelOverview: vi.fn(),
    getResumePerformance: vi.fn(),
    getSourcePerformance: vi.fn(),
    getCampaignPerformance: vi.fn(),
    getSkillInsights: vi.fn(),
    getWeightTuning: vi.fn(),
    getAIStatus: vi.fn(),
  },
}));

describe('Analytics (Strategic Decision Workspace)', () => {
  const mockFunnel = {
    total_discovered: 120,
    total_matched: 85,
    total_triggered: 50,
    total_submitted: 42,
    total_responded: 15,
    total_interviewed: 8,
    total_offered: 2,
    total_rejected: 5,
    match_rate_pct: 70.8,
    trigger_rate_pct: 58.8,
    submission_rate_pct: 84.0,
    response_rate_pct: 35.7,
    interview_rate_pct: 19.0,
    offer_rate_pct: 4.8,
    total_applied: 42,
    stages: [
      { stage_name: 'Discovered', count: 120, conversion_rate_pct: 100 },
      { stage_name: 'AI Matched', count: 85, conversion_rate_pct: 70.8 },
      { stage_name: 'Applications Triggered', count: 50, conversion_rate_pct: 58.8 },
      { stage_name: 'Confirmed Submissions', count: 42, conversion_rate_pct: 84.0 },
      { stage_name: 'Employer Responses', count: 15, conversion_rate_pct: 35.7 },
      { stage_name: 'Interviews', count: 8, conversion_rate_pct: 19.0 },
      { stage_name: 'Offers', count: 2, conversion_rate_pct: 4.8 },
    ],
  };

  const mockResumes = [
    {
      resume_id: 'res_1',
      label: 'Staff Frontend React Resume',
      target_role: 'Senior / Staff Frontend',
      applications_count: 24,
      response_count: 8,
      interview_count: 6,
      offer_count: 2,
      response_rate_pct: 33.3,
      interview_rate_pct: 25.0,
      offer_rate_pct: 8.3,
      conversion_rate_pct: 25.0,
    },
    {
      resume_id: 'res_2',
      label: 'Fullstack TypeScript Resume',
      target_role: 'Fullstack Engineer',
      applications_count: 18,
      response_count: 4,
      interview_count: 2,
      offer_count: 0,
      response_rate_pct: 22.2,
      interview_rate_pct: 11.1,
      offer_rate_pct: 0.0,
      conversion_rate_pct: 11.1,
    },
  ];

  const mockWeightTuning = {
    current_skill_weight: 0.40,
    current_semantic_weight: 0.35,
    current_experience_weight: 0.25,
    recommended_skill_weight: 0.45,
    recommended_semantic_weight: 0.35,
    recommended_experience_weight: 0.20,
    confidence_score: 0.92,
    rationale: 'Skill overlap increases interview callback rate for frontend roles.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getFunnelOverview as any).mockResolvedValue(mockFunnel);
    (api.getResumePerformance as any).mockResolvedValue(mockResumes);
    (api.getSourcePerformance as any).mockResolvedValue([]);
    (api.getCampaignPerformance as any).mockResolvedValue([]);
    (api.getSkillInsights as any).mockResolvedValue([]);
    (api.getWeightTuning as any).mockResolvedValue(mockWeightTuning);
    (api.getAIStatus as any).mockResolvedValue({
      primary_provider: 'groq',
      active_routing: 'groq (llama-3.3-70b-versatile)',
    });
  });

  it('renders strategic analytics workspace with 6 date range presets', async () => {
    render(
      <ToastProvider>
        <Analytics />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Analytics & Strategy')).toBeDefined();
      expect(screen.getByText('Decision Workspace')).toBeDefined();
      expect(screen.getByText('Today')).toBeDefined();
      expect(screen.getByText('7D')).toBeDefined();
      expect(screen.getByText('30D')).toBeDefined();
      expect(screen.getByText('90D')).toBeDefined();
      expect(screen.getByText('Custom')).toBeDefined();
      expect(screen.getByText('All Time')).toBeDefined();
    });
  });

  it('renders the complete 7-stage conversion funnel and separate outcome KPIs', async () => {
    render(
      <ToastProvider>
        <Analytics />
      </ToastProvider>
    );

    await waitFor(() => {
      // Complete 7 stages
      expect(screen.getByText('Full Conversion Funnel (7 Stages)')).toBeDefined();
      expect(screen.getAllByText('Discovered')[0]).toBeDefined();
      expect(screen.getByText('AI Matched')).toBeDefined();
      expect(screen.getByText('Applications Triggered')).toBeDefined();
      expect(screen.getAllByText('Confirmed Submissions')[0]).toBeDefined();
      expect(screen.getByText('Employer Responses')).toBeDefined();
      expect(screen.getAllByText('Interviews')[0]).toBeDefined();
      expect(screen.getAllByText('Offers')[0]).toBeDefined();

      // Separate Executive KPIs
      expect(screen.getByText('Employer Response Rate')).toBeDefined();
      expect(screen.getAllByText('35.7%')[0]).toBeDefined();
      expect(screen.getByText('Interview Rate')).toBeDefined();
      expect(screen.getAllByText('19.0%')[0]).toBeDefined();
      expect(screen.getByText('Offer Rate')).toBeDefined();
      expect(screen.getAllByText('4.8%')[0]).toBeDefined();
    });
  });

  it('renders Resume Performance Comparison with observational terminology and sample size', async () => {
    render(
      <ToastProvider>
        <Analytics />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Resume Performance Comparison')).toBeDefined();
      expect(screen.getByText('Highest Observed Interview Rate')).toBeDefined();
      expect(screen.getByText('Staff Frontend React Resume')).toBeDefined();
      expect(screen.getByText('25.0% Interview Rate')).toBeDefined();
      expect(screen.getByText(/24 submissions/)).toBeDefined();

      // Verify no A/B testing or experimental winner jargon
      expect(screen.queryByText('A/B Test Winner')).toBeNull();
      expect(screen.queryByText('Statistically Significant')).toBeNull();
    });
  });

  it('renders AI Matching Strategy as read-only with navigation link instead of mutation button', async () => {
    const onNavigate = vi.fn();
    render(
      <ToastProvider>
        <Analytics onNavigate={onNavigate} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('AI Matching Strategy & Optimization')).toBeDefined();
      expect(screen.getByText('Configure Matching Strategy')).toBeDefined();
      // Ensure the old mutation button is removed
      expect(screen.queryByText('Apply AI Recommended Strategy')).toBeNull();
    });

    fireEvent.click(screen.getByText('Configure Matching Strategy'));
    expect(onNavigate).toHaveBeenCalledWith('matches');
  });

  it('switches to custom date range inputs when Custom is clicked', async () => {
    render(
      <ToastProvider>
        <Analytics />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Custom'));

    await waitFor(() => {
      expect(screen.getByText('Custom Date Range:')).toBeDefined();
      expect(screen.getByText('From:')).toBeDefined();
      expect(screen.getByText('To:')).toBeDefined();
    });
  });
});
