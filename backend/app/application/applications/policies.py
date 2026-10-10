from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from app.domain.campaigns.entities import CampaignSafetyPolicy


@dataclass
class EffectiveQuota:
    effective_daily_limit: int
    today_applied_count: int
    quota_remaining: int
    hourly_limit: int
    hourly_applied_count: int
    is_quota_exhausted: bool


class ApplicationPolicyEnforcer:
    """
    Computes effective application limits across Campaign, Platform, and Account Safe Ceilings.
    Authoritative source of truth for rate and quota ceilings.
    """

    @staticmethod
    def calculate_effective_quota(
        campaign_policy: Optional[CampaignSafetyPolicy],
        platform_cap: int = 50,
        account_ceiling: int = 50,
        today_applied_count: int = 0,
        hourly_applied_count: int = 0,
    ) -> EffectiveQuota:
        limits = [account_ceiling, platform_cap]
        hourly_limit = 10

        if campaign_policy:
            limits.append(campaign_policy.daily_application_limit)
            hourly_limit = campaign_policy.hourly_application_limit

        effective_daily_limit = min(limits)
        quota_remaining = max(0, effective_daily_limit - today_applied_count)

        return EffectiveQuota(
            effective_daily_limit=effective_daily_limit,
            today_applied_count=today_applied_count,
            quota_remaining=quota_remaining,
            hourly_limit=hourly_limit,
            hourly_applied_count=hourly_applied_count,
            is_quota_exhausted=quota_remaining <= 0,
        )
