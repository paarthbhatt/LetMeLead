"""Password hashing, JWT issuance and API-key handling."""

from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from .config import settings

_hasher = PasswordHasher()

ACCESS = "access"
REFRESH = "refresh"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:  # malformed hash must not 500 the login endpoint
        return False


def create_token(
    subject: str,
    kind: Literal["access", "refresh"],
    tenant_id: str | None = None,
    role: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    if kind == ACCESS:
        expires = now + timedelta(minutes=settings.access_token_minutes)
    else:
        expires = now + timedelta(days=settings.refresh_token_days)
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": kind,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    if tenant_id:
        payload["tid"] = tenant_id
    if role:
        payload["role"] = role
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, kind: Literal["access", "refresh"] = ACCESS) -> dict[str, Any]:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_api_key() -> tuple[str, str, str]:
    """Return (plaintext, prefix, hash). The plaintext is shown exactly once."""
    raw = secrets.token_urlsafe(32)
    token = f"lml_{raw}"
    # The prefix must be a prefix of the plaintext key: it is the lookup index.
    prefix = token[:8]
    return token, prefix, hash_api_key(token)


def hash_api_key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _fernet() -> Fernet:
    if settings.session_encryption_key:
        raw = settings.session_encryption_key.encode()
        try:
            return Fernet(raw)
        except (ValueError, TypeError):
            pass
    # Derive a stable key from whatever was configured so local dev works without ceremony.
    digest = hashlib.sha256(settings.session_encryption_key.encode() or settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("stored session could not be decrypted; reconnect the account") from exc
