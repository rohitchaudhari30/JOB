"""SEC-02 / SEC-03: secrets must be real unless the app runs in dev/test."""
import base64

import pytest

from app.core.config import KNOWN_INSECURE_VALUES, Settings

GOOD_SECRET = "x" * 40
GOOD_ENC = base64.b64encode(b"k" * 32).decode()


def make(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_default_environment_is_not_dev_and_demo_seed_is_off(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)  # conftest sets APP_ENV=test
    s = make()
    assert s.is_dev_environment is False
    assert s.SEED_DEMO_USER is False
    assert s.DEBUG is False


def test_production_refuses_missing_secrets():
    with pytest.raises(ValueError):
        make(APP_ENV="production").validate_production_secrets()


@pytest.mark.parametrize("known", sorted(KNOWN_INSECURE_VALUES))
def test_production_refuses_the_old_public_defaults(known):
    with pytest.raises(ValueError):
        make(APP_ENV="production", SECRET_KEY=known, ENCRYPTION_KEY=GOOD_ENC).validate_production_secrets()
    with pytest.raises(ValueError):
        make(APP_ENV="production", SECRET_KEY=GOOD_SECRET, ENCRYPTION_KEY=known).validate_production_secrets()


def test_production_accepts_real_secrets():
    make(APP_ENV="production", SECRET_KEY=GOOD_SECRET, ENCRYPTION_KEY=GOOD_ENC).validate_production_secrets()


def test_dev_generates_random_secrets_instead_of_a_public_key():
    a, b = make(APP_ENV="development"), make(APP_ENV="development")
    a.validate_production_secrets()
    b.validate_production_secrets()
    assert a.SECRET_KEY not in KNOWN_INSECURE_VALUES and len(a.SECRET_KEY) >= 32
    assert a.ENCRYPTION_KEY not in KNOWN_INSECURE_VALUES
    assert len(base64.b64decode(a.ENCRYPTION_KEY)) == 32
    assert a.SECRET_KEY != b.SECRET_KEY  # not a shared constant
