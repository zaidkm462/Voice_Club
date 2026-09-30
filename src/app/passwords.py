"""Password storage helpers. Never accept plaintext database values at login."""
import re

from werkzeug.security import check_password_hash, generate_password_hash


def is_password_hash(value):
    if not isinstance(value, str):
        return False
    return bool(re.fullmatch(
        r"(?:scrypt:[0-9]+:[0-9]+:[0-9]+|pbkdf2:sha256:[0-9]+)"
        r"\$[A-Za-z0-9]+\$[0-9a-f]+", value
    ))


def hash_password(password):
    if not isinstance(password, str) or not password:
        raise ValueError("A nonempty password is required")
    return generate_password_hash(password, method="scrypt:32768:8:1")


def verify_password(stored_hash, password):
    if not isinstance(password, str) or not password or not is_password_hash(stored_hash):
        return False
    try:
        return check_password_hash(stored_hash, password)
    except (ValueError, TypeError, OverflowError):
        return False
