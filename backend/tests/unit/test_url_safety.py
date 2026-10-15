"""SEC-15: the automation browser only opens public http(s) pages."""
import pytest

from app.core.config import settings
from app.core.url_safety import unsafe_url_reason


@pytest.fixture(autouse=True)
def strict(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_PRIVATE_APPLY_URLS", False)


@pytest.mark.parametrize("url", [
    "https://boards.greenhouse.io/acme/jobs/123",
    "http://www.naukri.com/job-listings-x",
    "https://8.8.8.8/apply",  # a public address
])
def test_public_urls_are_allowed(url):
    assert unsafe_url_reason(url) is None


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.com/x",
    "http://localhost:8000/admin",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",   # cloud metadata
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://printer.local/",
    "",
    None,
])
def test_unsafe_urls_are_blocked(url):
    assert unsafe_url_reason(url)


def test_dev_switch_allows_localhost(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_PRIVATE_APPLY_URLS", True)
    assert unsafe_url_reason("http://localhost:5000/form") is None
    assert unsafe_url_reason("file:///etc/passwd")  # scheme is still checked
