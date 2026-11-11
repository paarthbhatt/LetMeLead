"""Security primitives: password hashing, JWT tokens, API keys and secret encryption."""

from __future__ import annotations

import jwt
import pytest
from letmelead import security
from letmelead.config import settings


def test_password_roundtrip():
    hashed = security.hash_password("correct-horse-battery")
    assert hashed != "correct-horse-battery"
    assert security.verify_password("correct-horse-battery", hashed)
    assert not security.verify_password("wrong-password", hashed)


def test_verify_password_tolerates_malformed_hash():
    # A malformed stored hash must never 500 the login endpoint.
    assert not security.verify_password("x", None)
    assert not security.verify_password("x", "not-a-valid-argon2-hash")


def test_access_token_roundtrip_carries_tenant_and_role():
    token = security.create_token("user-1", security.ACCESS, tenant_id="tenant-1", role="owner")
    payload = security.decode_token(token, security.ACCESS)
    assert payload["sub"] == "user-1"
    assert payload["tid"] == "tenant-1"
    assert payload["role"] == "owner"
    assert payload["typ"] == security.ACCESS


def test_refresh_token_has_longer_expiry():
    access = security.create_token("user-1", security.ACCESS)
    refresh = security.create_token("user-1", security.REFRESH)
    a_exp = security.decode_token(access, security.ACCESS)["exp"]
    r_exp = security.decode_token(refresh, security.REFRESH)["exp"]
    assert r_exp - a_exp > settings.access_token_minutes * 60


def test_decode_rejects_wrong_token_type():
    access = security.create_token("user-1", security.ACCESS)
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_token(access, security.REFRESH)


def test_decode_rejects_garbage():
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_token("not.a.jwt", security.ACCESS)


def test_new_api_key_shape_and_hash():
    plaintext, prefix, digest = security.new_api_key()
    assert plaintext.startswith("lml_")
    assert prefix == plaintext[:8]
    assert digest == security.hash_api_key(plaintext)
    # Keys are unique and always hashable back to the stored digest.
    other = security.new_api_key()
    assert other[0] != plaintext


def test_secret_encryption_roundtrip():
    ciphertext = security.encrypt_secret("li_session_cookie_value")
    assert ciphertext != "li_session_cookie_value"
    assert security.decrypt_secret(ciphertext) == "li_session_cookie_value"


def test_decrypt_secret_rejects_tampered_ciphertext():
    with pytest.raises(ValueError, match="reconnect"):
        security.decrypt_secret(security.encrypt_secret("hello")[:-4] + "AAAA")
