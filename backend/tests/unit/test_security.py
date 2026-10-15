import pytest
from app.core.security import (
    SessionStorageEncryptor,
    create_access_token,
    decode_access_token,
    get_password_hash,
    session_encryptor,
    verify_password,
)


def test_password_hashing():
    password = "MySecurePassword123!"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_generation_and_decoding():
    data = {"sub": "user_123", "email": "candidate@example.com"}
    token = create_access_token(data)
    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload["sub"] == "user_123"
    assert payload["email"] == "candidate@example.com"
    assert "exp" in payload


def test_aes_256_gcm_session_storage_encryption():
    encryptor = SessionStorageEncryptor()

    sample_cookies = {
        "cookies": [
            {"name": "naukri_auth_token", "value": "secret_session_token_xyz987", "domain": ".naukri.com"}
        ],
        "origins": [{"origin": "https://www.naukri.com", "localStorage": [{"name": "user_id", "value": "12345"}]}],
    }

    # Encrypt
    encrypted_b64 = encryptor.encrypt(sample_cookies)
    assert isinstance(encrypted_b64, str)
    assert encrypted_b64 != str(sample_cookies)
    assert "secret_session_token" not in encrypted_b64

    # Decrypt
    decrypted_json = encryptor.decrypt_json(encrypted_b64)
    assert decrypted_json == sample_cookies
    assert decrypted_json["cookies"][0]["value"] == "secret_session_token_xyz987"


# --- SEC-12: strict encryption key handling ---------------------------------

import base64 as _b64
import os as _os

import pytest as _pytest

from app.core.security import SessionStorageEncryptor as _Enc


def _key() -> str:
    return _b64.b64encode(_os.urandom(32)).decode()


@_pytest.mark.parametrize("bad", ["not base64 !!!", _b64.b64encode(b"too short").decode()])
def test_bad_encryption_keys_are_rejected(bad):
    with _pytest.raises(ValueError):
        _Enc(bad, previous_keys=[])


def test_old_key_can_still_decrypt_after_rotation():
    old_key, new_key = _key(), _key()
    blob = _Enc(old_key, previous_keys=[]).encrypt("secret session")
    rotated = _Enc(new_key, previous_keys=[old_key])
    assert rotated.decrypt(blob) == "secret session"
    assert _Enc(new_key, previous_keys=[]).encrypt("x") != blob


def test_unknown_key_cannot_decrypt():
    blob = _Enc(_key(), previous_keys=[]).encrypt("secret")
    with _pytest.raises(ValueError):
        _Enc(_key(), previous_keys=[]).decrypt(blob)
