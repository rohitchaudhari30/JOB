import base64
import os
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import bcrypt
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
    """Creates a signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decodes and verifies a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise AuthenticationException("Could not validate credentials.")


class SessionStorageEncryptor:
    """
    Handles envelope encryption and decryption of Playwright storage_state
    using AES-256-GCM (12-byte IV, 16-byte authentication tag).
    """
    def __init__(self, key_b64: str | None = None):
        key_raw = key_b64 or settings.ENCRYPTION_KEY
        try:
            self._key = base64.b64decode(key_raw)
            if len(self._key) != 32:
                self._key = self._key.ljust(32, b"0")[:32]
        except Exception:
            self._key = os.urandom(32)
        self._aesgcm = AESGCM(self._key)

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
        decrypted_bytes = self._aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted_bytes.decode("utf-8")

    def encrypt_storage_state(self, plain_data: str | dict) -> str:
        return self.encrypt(plain_data)

    def decrypt_storage_state(self, encrypted_b64: str) -> str:
        return self.decrypt(encrypted_b64)

    def decrypt_json(self, encrypted_b64: str) -> dict:
        plain_text = self.decrypt(encrypted_b64)
        return json.loads(plain_text)


session_encryptor = SessionStorageEncryptor()
session_crypto = session_encryptor

