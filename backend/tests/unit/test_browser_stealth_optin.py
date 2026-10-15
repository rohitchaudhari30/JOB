from app.core.config import settings
from app.infrastructure.browser import browser_manager as bm


def test_stealth_is_off_by_default():
    assert settings.BROWSER_STEALTH_ENABLED is False
    assert bm._stealth_launch_args() == []
    assert bm._identity_options() == {}


def test_stealth_can_be_turned_on(monkeypatch):
    monkeypatch.setattr(settings, "BROWSER_STEALTH_ENABLED", True)
    assert "--disable-blink-features=AutomationControlled" in bm._stealth_launch_args()
    assert "user_agent" in bm._identity_options()
