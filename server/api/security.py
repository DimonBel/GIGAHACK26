"""Password hashes and session tokens (standard library only)."""
import hashlib
import hmac
import secrets

SCRYPT = dict(n=2 ** 14, r=8, p=1)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **SCRYPT)
    return hmac.compare_digest(candidate.hex(), digest)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    """Sessions are stored by hash, so a copy of the database cannot be used to sign in."""
    return hashlib.sha256(token.encode()).hexdigest()
