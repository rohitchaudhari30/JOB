"""Checks for URLs that the browser is about to open (SEC-15).

Apply links are scraped from third-party pages, so a hostile listing could point the
automation browser at something on our own network (localhost, cloud metadata, a
private address). We only allow public http(s) targets.

Limit: this checks the host text, not what DNS resolves to later. A DNS-rebinding
attack needs network-level egress rules as well.
"""
import ipaddress
from urllib.parse import urlparse

from app.core.config import settings

_BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home.arpa")


def unsafe_url_reason(url: str | None) -> str | None:
    """Return why the URL must not be opened, or None if it is acceptable."""
    if not url:
        return "empty URL"
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        return f"scheme '{parsed.scheme}' is not allowed"
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return "missing host"
    if settings.ALLOW_PRIVATE_APPLY_URLS:
        return None  # development / test pages on localhost

    if host == "localhost" or host.endswith(_BLOCKED_SUFFIXES):
        return f"host '{host}' is a local name"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None  # an ordinary domain name
    if not ip.is_global:
        return f"address {ip} is private, loopback or link-local"
    return None
