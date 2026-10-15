import { Campaign } from '../../types';

export type SchedulePreset = 'manual' | '3hours' | 'morning' | 'evening' | 'custom';

export interface SafetySettings {
  schedulePreset: SchedulePreset;
  scheduleIntervalMins: number;
  dailyLimit: number;
  hourlyLimit: number;
  cooldownSecs: number;
  operatingStart: string;
  operatingEnd: string;
}

export const DEFAULT_SAFETY: SafetySettings = {
  schedulePreset: '3hours',
  scheduleIntervalMins: 180,
  dailyLimit: 20,
  hourlyLimit: 5,
  cooldownSecs: 90,
  operatingStart: '09:00',
  operatingEnd: '18:00',
};

const MORNING_CRON = '0 9 * * 1-5';
const EVENING_CRON = '0 19 * * *';
const THREE_HOURS = 180;

/** Fill the form values from a saved campaign; anything missing keeps its current value. */
export function applyCampaignToSafety(current: SafetySettings, campaign: Campaign): SafetySettings {
  const next = { ...current };
  const policy = campaign.safety_policy;
  if (policy) {
    next.dailyLimit = policy.daily_application_limit || 20;
    next.hourlyLimit = policy.hourly_application_limit || 5;
    next.cooldownSecs = policy.cooldown_seconds || 90;
    next.operatingStart = policy.operating_start_time || '09:00';
    next.operatingEnd = policy.operating_end_time || '18:00';
  }

  const schedule = campaign.schedule;
  if (schedule) {
    if (!schedule.is_active) {
      next.schedulePreset = 'manual';
    } else if (schedule.cron_expression === MORNING_CRON) {
      next.schedulePreset = 'morning';
    } else if (schedule.cron_expression === EVENING_CRON) {
      next.schedulePreset = 'evening';
    } else if (schedule.interval_minutes === THREE_HOURS) {
      next.schedulePreset = '3hours';
    } else if (schedule.interval_minutes) {
      next.schedulePreset = 'custom';
      next.scheduleIntervalMins = schedule.interval_minutes;
    }
  }
  return next;
}

export function toSafetyPolicyPayload(s: SafetySettings) {
  return {
    daily_application_limit: s.dailyLimit,
    hourly_application_limit: s.hourlyLimit,
    cooldown_seconds: s.cooldownSecs,
    operating_start_time: s.operatingStart,
    operating_end_time: s.operatingEnd,
  };
}

export function toSchedulePayload(s: SafetySettings) {
  return {
    is_active: s.schedulePreset !== 'manual',
    interval_minutes:
      s.schedulePreset === '3hours' ? THREE_HOURS : s.schedulePreset === 'custom' ? s.scheduleIntervalMins : undefined,
    cron_expression:
      s.schedulePreset === 'morning' ? MORNING_CRON : s.schedulePreset === 'evening' ? EVENING_CRON : undefined,
  };
}
