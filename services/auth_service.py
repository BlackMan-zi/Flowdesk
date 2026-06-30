import secrets
import string
import pyotp
import qrcode
import io
import base64
from fastapi import HTTPException
from passlib.context import CryptContext
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Readable alphabet — omits 0/O/1/I/L to avoid visual confusion so the code
# can be shared by voice/chat without transcription errors.
_READABLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def generate_temp_password(length: int = 10) -> str:
    """Generate a CSPRNG readable one-time password (length >= 8 recommended).

    Uses an unambiguous alphabet so it survives being shared out-of-band. Never
    persist the plaintext — store only its bcrypt hash and show it once.
    """
    return "".join(secrets.choice(_READABLE_ALPHABET) for _ in range(length))


def validate_password_strength(password: str) -> None:
    """Server-side strength enforcement for user-chosen passwords.

    Raises HTTPException(400) if the password is too weak. The client checklist
    is UX only; this is the real gate.
    """
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if not any(c.isupper() for c in password):
        problems.append("an uppercase letter")
    if not any(c.islower() for c in password):
        problems.append("a lowercase letter")
    if not any(c.isdigit() for c in password):
        problems.append("a digit")
    if not any(c in string.punctuation for c in password):
        problems.append("a special character")
    if problems:
        raise HTTPException(
            status_code=400,
            detail="Password must contain " + ", ".join(problems) + ".",
        )


def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, user_email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=user_email,
        issuer_name=settings.APP_NAME
    )


def generate_qr_code_base64(uri: str) -> str:
    """Generate QR code as base64 string."""
    img = qrcode.make(uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)
