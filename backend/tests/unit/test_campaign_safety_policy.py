from datetime import datetime, timezone
import pytest
from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
from app.domain.campaigns.entities import CampaignSafetyPolicy


def test_safety_policy_daily_limit_exceeded():
    policy = CampaignSafetyPolicy(daily_application_limit=10, hourly_application_limit=5)
    can_apply, reason = SafetyPolicyEvaluator.evaluate(
        policy=policy,
        today_count=10,
        hourly_count=2,
    )
    assert can_apply is False
    assert "Daily limit reached" in reason


def test_safety_policy_hourly_limit_exceeded():
    policy = CampaignSafetyPolicy(daily_application_limit=20, hourly_application_limit=4)
    can_apply, reason = SafetyPolicyEvaluator.evaluate(
        policy=policy,
        today_count=6,
        hourly_count=4,
    )
    assert can_apply is False
    assert "Hourly limit reached" in reason


def test_safety_policy_outside_operating_window():
    policy = CampaignSafetyPolicy(
        daily_application_limit=20,
        hourly_application_limit=5,
        operating_start_time="09:00",
        operating_end_time="17:00",
    )
    # Test at 20:00 (outside window)
    now_outside = datetime(2026, 10, 7, 20, 0, tzinfo=timezone.utc)
    can_apply, reason = SafetyPolicyEvaluator.evaluate(
        policy=policy,
        today_count=2,
        hourly_count=1,
        now_dt=now_outside,
    )
    assert can_apply is False
    assert "Outside operating window" in reason


def test_safety_policy_allowed():
    policy = CampaignSafetyPolicy(
        daily_application_limit=25,
        hourly_application_limit=6,
        operating_start_time="08:00",
        operating_end_time="20:00",
    )
    now_inside = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)
    can_apply, reason = SafetyPolicyEvaluator.evaluate(
        policy=policy,
        today_count=10,
        hourly_count=2,
        now_dt=now_inside,
    )
    assert can_apply is True
    assert reason == "ALLOWED"
