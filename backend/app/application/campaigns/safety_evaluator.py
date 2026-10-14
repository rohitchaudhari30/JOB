from datetime import datetime, time, timezone
from typing import Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from app.domain.campaigns.entities import CampaignSafetyPolicy


class SafetyPolicyEvaluator:
    """Evaluates whether an application attempt adheres to safety and pacing policies."""

    @staticmethod
    def is_within_operating_window(policy: CampaignSafetyPolicy, now_dt: datetime | None = None) -> bool:
        if not policy.operating_start_time or not policy.operating_end_time:
            return True

        now = now_dt or datetime.now(timezone.utc)

        try:
            # Compare against the clock of the campaign's own timezone, not UTC (AUT-18).
            zone = ZoneInfo(getattr(policy, "timezone", None) or "UTC")
            current_time = now.astimezone(zone).time().replace(tzinfo=None)

            start_parts = [int(p) for p in policy.operating_start_time.split(":")]
            end_parts = [int(p) for p in policy.operating_end_time.split(":")]
            start_time = time(start_parts[0], start_parts[1])
            end_time = time(end_parts[0], end_parts[1])
        except (ValueError, IndexError, ZoneInfoNotFoundError):
            # An unreadable window must never let applications through (fail closed).
            return False

        if start_time <= end_time:
            return start_time <= current_time <= end_time
        # Window spans midnight
        return current_time >= start_time or current_time <= end_time

    @staticmethod
    def evaluate(
        policy: CampaignSafetyPolicy,
        today_count: int,
        hourly_count: int,
        now_dt: datetime | None = None,
    ) -> Tuple[bool, str]:
        """
        Returns (can_apply, reason).
        Reasons: ALLOWED, DAILY_LIMIT_EXCEEDED, HOURLY_LIMIT_EXCEEDED, OUTSIDE_OPERATING_WINDOW
        """
        if today_count >= policy.daily_application_limit:
            return False, f"Daily limit reached ({today_count}/{policy.daily_application_limit} applications)."

        if hourly_count >= policy.hourly_application_limit:
            return False, f"Hourly limit reached ({hourly_count}/{policy.hourly_application_limit} applications)."

        if not SafetyPolicyEvaluator.is_within_operating_window(policy, now_dt):
            return False, f"Outside operating window ({policy.operating_start_time} - {policy.operating_end_time})."

        return True, "ALLOWED"
