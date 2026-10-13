"""SEC-14: secrets are stripped from log lines."""
import logging

from app.core.logging import RedactingFormatter, redact


def test_bearer_tokens_and_jwts_are_hidden():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlMTIz"
    assert jwt not in redact(f"token was {jwt}")
    assert "abc123secret" not in redact("Authorization: Bearer abc123secret")


def test_key_value_secrets_are_hidden_but_other_text_is_kept():
    out = redact("login ok user=bob password=hunter2 api_key=sk-XYZ")
    assert "hunter2" not in out and "sk-XYZ" not in out
    assert "user=bob" in out and "login ok" in out
    assert "hunter2" not in redact('{"password": "hunter2"}')


def test_formatter_redacts_exception_tracebacks_too():
    formatter = RedactingFormatter("%(message)s")
    try:
        raise ValueError("bad password=hunter2")
    except ValueError:
        import sys
        record = logging.LogRecord("t", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    assert "hunter2" not in formatter.format(record)
