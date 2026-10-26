import base64
import os
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import bcrypt
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import jwt, JWTError
from app.core.config import settings
from app.core.exceptions import AuthenticationException


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    try:
        # bcrypt requires bytes and max 72 bytes length
        plain_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(plain_bytes, hash_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Generates a bcrypt hash for a plaintext password."""
    plain_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_bytes, salt).decode("utf-8")


def create_access_token(data: Dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Creates a signed, short-lived JWT access token (default 15 minutes)."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now, "type": "access", "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Creates a signed, revocable JWT refresh token (default 7 days)."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "iat": now, "type": "refresh", "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decodes and verifies a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise AuthenticationException("Could not validate credentials.")
    # A refresh token must never be accepted where an access token is expected. (SEC-04)
    if payload.get("type") != "access":
        raise AuthenticationException("Could not validate credentials.")
    return payload


def decode_refresh_token(token: str) -> Dict[str, Any]:
    """Decodes and verifies a JWT refresh token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise AuthenticationException("Invalid token type. Refresh token required.")
        return payload
    except JWTError:
        raise AuthenticationException("Invalid or expired refresh token.")


def issued_before_cutoff(payload: Dict[str, Any], tokens_valid_after: datetime | None) -> bool:
    """True when the token was issued before the user's "sign out everywhere" moment.

    JWT `iat` has whole-second resolution, so compare against the cut-off truncated to the second:
    a token minted in the same second as the change (the fresh one handed back to the caller) stays valid.
    """
    if tokens_valid_after is None:
        return False
    if tokens_valid_after.tzinfo is None:
        tokens_valid_after = tokens_valid_after.replace(tzinfo=timezone.utc)
    iat = payload.get("iat")
    if iat is None:
        return True  # no issue time on a user with a cut-off: cannot prove it is newer
    return int(iat) < int(tokens_valid_after.timestamp())


class SessionStorageEncryptor:
    """
    Handles envelope encryption and decryption of Playwright storage_state
    using AES-256-GCM (12-byte IV, 16-byte authentication tag).
    """
    def __init__(self, key_b64: str | None = None, previous_keys: list[str] | None = None):
        self._key = self._load_key(key_b64 or settings.ENCRYPTION_KEY)
        self._aesgcm = AESGCM(self._key)
        if previous_keys is None:
            previous_keys = [k.strip() for k in settings.ENCRYPTION_KEY_PREVIOUS.split(",") if k.strip()]
        self._old_aesgcms = [AESGCM(self._load_key(k)) for k in previous_keys]

    @staticmethod
    def _load_key(key_b64: str) -> bytes:
        """Strict: a bad key stops the app. Never pad it or invent a random one,
        because that would make stored sessions unreadable after a restart. (SEC-12)"""
        try:
            key = base64.b64decode(key_b64, validate=True)
        except Exception as exc:
            raise ValueError("ENCRYPTION_KEY must be valid base64.") from exc
        if len(key) != 32:
            raise ValueError("ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).")
        return key

    def encrypt(self, plain_data: str | dict) -> str:
        """Encrypts plain string or JSON object into a Base64 ciphertext envelope."""
        if isinstance(plain_data, dict):
            raw_bytes = json.dumps(plain_data).encode("utf-8")
        else:
            raw_bytes = str(plain_data).encode("utf-8")

        nonce = os.urandom(12)  # 12-byte IV for AES-GCM
        ciphertext = self._aesgcm.encrypt(nonce, raw_bytes, None)
        payload = nonce + ciphertext
        return base64.b64encode(payload).decode("utf-8")

    def decrypt(self, encrypted_b64: str) -> str:
        """Decrypts a Base64 ciphertext envelope back into a plain string."""
        raw_payload = base64.b64decode(encrypted_b64.encode("utf-8"))
        if len(raw_payload) < 28:
            raise ValueError("Invalid encrypted payload length.")
        nonce = raw_payload[:12]
        ciphertext = raw_payload[12:]
        for aesgcm in [self._aesgcm, *self._old_aesgcms]:
            try:
                decrypted_str = aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
                try:
                    return json.loads(decrypted_str)
                except Exception:
                    return decrypted_str
            except InvalidTag:
                continue  # wrong key: try the next (older) one
        raise ValueError("Could not decrypt: the data was encrypted with an unknown key.")

    def encrypt_storage_state(self, plain_data: str | dict) -> str:
        return self.encrypt(plain_data)

    def decrypt_storage_state(self, encrypted_b64: str) -> str:
        return self.decrypt(encrypted_b64)

    def decrypt_json(self, encrypted_b64: str) -> dict:
        plain = self.decrypt(encrypted_b64)
        if isinstance(plain, dict):
            return plain
        return json.loads(plain)


session_encryptor = SessionStorageEncryptor()

