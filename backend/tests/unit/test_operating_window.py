from datetime import datetime, timezone

from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
from app.domain.campaigns.entities import CampaignSafetyPolicy

# 04:30 UTC is 10:00 in India (UTC+5:30)
FOUR_THIRTY_UTC = datetime(2026, 10, 14, 4, 30, tzinfo=timezone.utc)


def test_window_uses_the_campaign_timezone():
    india = CampaignSafetyPolicy(operating_start_time="09:00", operating_end_time="18:00", timezone="Asia/Kolkata")
    utc = CampaignSafetyPolicy(operating_start_time="09:00", operating_end_time="18:00", timezone="UTC")
    assert SafetyPolicyEvaluator.is_within_operating_window(india, FOUR_THIRTY_UTC) is True
    assert SafetyPolicyEvaluator.is_within_operating_window(utc, FOUR_THIRTY_UTC) is False


def test_unreadable_window_blocks_instead_of_allowing():
    broken = CampaignSafetyPolicy(operating_start_time="nine", operating_end_time="18:00")
    assert SafetyPolicyEvaluator.is_within_operating_window(broken, FOUR_THIRTY_UTC) is False
    bad_zone = CampaignSafetyPolicy(timezone="Mars/Phobos")
    assert SafetyPolicyEvaluator.is_within_operating_window(bad_zone, FOUR_THIRTY_UTC) is False


def test_window_that_crosses_midnight():
    night = CampaignSafetyPolicy(operating_start_time="22:00", operating_end_time="06:00", timezone="UTC")
    assert SafetyPolicyEvaluator.is_within_operating_window(night, FOUR_THIRTY_UTC) is True
