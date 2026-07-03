"""
What this file does: Provides encrypt/decrypt helpers for secret variable values using Fernet
symmetric encryption; the key is read from SECRET_ENC_KEY env var and validated at import time.
"""

import os
from cryptography.fernet import Fernet, InvalidToken

# Version prefix written before every ciphertext so old ciphertexts stay decryptable after rotation.
_CIPHERTEXT_PREFIX = "v1:"

_raw_key = os.environ.get("SECRET_ENC_KEY", "")
_fernet: "Fernet | None" = None


def _get_fernet() -> Fernet:
    """What it does: Return the module-level Fernet instance, initialising it on first call."""
    global _fernet
    if _fernet is None:
        if not _raw_key:
            raise RuntimeError(
                "SECRET_ENC_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(_raw_key.encode() if isinstance(_raw_key, str) else _raw_key)
    return _fernet


def is_ciphertext(value: str) -> bool:
    """What it does: Return True when value carries the version prefix that marks it as ciphertext."""
    return isinstance(value, str) and value.startswith(_CIPHERTEXT_PREFIX)


def encrypt(value: str) -> str:
    """
    What it does: Encrypt a plaintext string and return a versioned ciphertext string.
    Args:
        value: Plaintext to encrypt; empty string is encrypted as-is.
    Returns:
        str: Versioned ciphertext in the form ``v1:<base64-token>``.
    Raises:
        RuntimeError: When SECRET_ENC_KEY is unset.
    """
    token = _get_fernet().encrypt(value.encode()).decode()
    return f"{_CIPHERTEXT_PREFIX}{token}"


def decrypt(value: str) -> str:
    """
    What it does: Decrypt a versioned ciphertext string back to plaintext.
    Args:
        value: Ciphertext string produced by ``encrypt()``; strings without the version prefix
               are returned unchanged (treated as legacy plaintext during migration).
    Returns:
        str: Decrypted plaintext when value is valid ciphertext; original value when prefix absent.
    Raises:
        RuntimeError: When SECRET_ENC_KEY is unset.
        ValueError: When the ciphertext is present but corrupt or was encrypted with a different key.
    """
    if not is_ciphertext(value):
        # Legacy plaintext — no prefix means pre-migration row; pass through during transition.
        return value
    token = value[len(_CIPHERTEXT_PREFIX):]
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt secret: token invalid or key mismatch") from exc
