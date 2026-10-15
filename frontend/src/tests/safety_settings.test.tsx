import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  DEFAULT_SAFETY,
  applyCampaignToSafety,
  toSafetyPolicyPayload,
  toSchedulePayload,
} from '../pages/campaigns/safetySettings';
import { SafetyScheduleTab } from '../pages/campaigns/SafetyScheduleTab';

const campaign = (over: any = {}): any => ({ id: 'c1', name: 'x', ...over });

describe('safety settings helpers', () => {
  it('keeps current values when the campaign has no policy or schedule', () => {
    expect(applyCampaignToSafety(DEFAULT_SAFETY, campaign())).toEqual(DEFAULT_SAFETY);
  });

  it('reads limits and window from the saved policy', () => {
    const next = applyCampaignToSafety(
      DEFAULT_SAFETY,
      campaign({
        safety_policy: {
          daily_application_limit: 12,
          hourly_application_limit: 3,
          cooldown_seconds: 120,
          operating_start_time: '10:00',
          operating_end_time: '17:30',
        },
      })
    );
    expect(next).toMatchObject({ dailyLimit: 12, hourlyLimit: 3, cooldownSecs: 120, operatingStart: '10:00', operatingEnd: '17:30' });
  });

  it.each([
    [{ is_active: false }, 'manual'],
    [{ is_active: true, cron_expression: '0 9 * * 1-5' }, 'morning'],
    [{ is_active: true, cron_expression: '0 19 * * *' }, 'evening'],
    [{ is_active: true, interval_minutes: 180 }, '3hours'],
    [{ is_active: true, interval_minutes: 45 }, 'custom'],
  ])('maps schedule %j to preset %s', (schedule, preset) => {
    const next = applyCampaignToSafety(DEFAULT_SAFETY, campaign({ schedule }));
    expect(next.schedulePreset).toBe(preset);
  });

  it('round-trips a custom interval', () => {
    const settings = applyCampaignToSafety(DEFAULT_SAFETY, campaign({ schedule: { is_active: true, interval_minutes: 45 } }));
    expect(toSchedulePayload(settings)).toEqual({ is_active: true, interval_minutes: 45, cron_expression: undefined });
  });

  it('builds the policy payload and a manual schedule', () => {
    expect(toSafetyPolicyPayload(DEFAULT_SAFETY)).toEqual({
      daily_application_limit: 20,
      hourly_application_limit: 5,
      cooldown_seconds: 90,
      operating_start_time: '09:00',
      operating_end_time: '18:00',
    });
    expect(toSchedulePayload({ ...DEFAULT_SAFETY, schedulePreset: 'manual' }).is_active).toBe(false);
  });
});

describe('SafetyScheduleTab', () => {
  it('reports changes as patches and saves', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<SafetyScheduleTab settings={DEFAULT_SAFETY} saving={false} onChange={onChange} onSave={onSave} />);
    fireEvent.click(screen.getByText('Daily 7 PM'));
    expect(onChange).toHaveBeenCalledWith({ schedulePreset: 'evening' });
    fireEvent.click(screen.getByText(/Save Schedule/));
    expect(onSave).toHaveBeenCalled();
  });
});
