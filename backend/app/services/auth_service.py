"""
Security and cryptographic utilities for ShoulderTwin.

Uses NIST/OWASP-recommended PBKDF2-HMAC-SHA256 with 600,000 iterations and
unique per-user cryptographically random 32-byte salts.
Constant-time comparison protects against timing attacks.
Password reset tokens are cryptographically hashed before storage.
"""

import hashlib
import hmac
import os
import secrets
from typing import Tuple
from ..config import settings


ITERATIONS = settings.PBKDF2_ITERATIONS
HASH_NAME = "sha256"


def hash_token(token: str) -> str:
    """Compute cryptographic SHA-256 hash of a bearer or reset token for secure storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()



def hash_password(password: str, salt: bytes = None) -> Tuple[str, str]:
    """
    Hash a password using PBKDF2-HMAC-SHA256.
    Returns (hex_hashed_password, hex_salt).
    """
    if salt is None:
        salt = secrets.token_bytes(32)
    
    key = hashlib.pbkdf2_hmac(
        HASH_NAME,
        password.encode("utf-8"),
        salt,
        ITERATIONS,
    )
    return key.hex(), salt.hex()


def verify_password(plain_password: str, hashed_hex: str, salt_hex: str) -> bool:
    """
    Verify a plain password against the stored hex hash and salt.
    Uses constant-time comparison to prevent timing attacks.
    """
    try:
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(hashed_hex)
        candidate_key = hashlib.pbkdf2_hmac(
            HASH_NAME,
            plain_password.encode("utf-8"),
            salt,
            ITERATIONS,
        )
        return hmac.compare_digest(expected_key, candidate_key)
    except Exception:
        return False


def generate_session_token() -> str:
    """Generate a high-entropy URL-safe session token (32 bytes = 256 bits of entropy)."""
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    """Generate a high-entropy URL-safe password reset token."""
    return secrets.token_urlsafe(24)
