import secrets
import re
import bcrypt
import pyotp
import qrcode
import io
import base64
from config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password strength.
    
    Returns: (is_valid, error_message)
    
    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character (!@#$%^&*)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit"
    
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};:,.<>?]", password):
        return False, "Password must contain at least one special character (!@#$%^&*)"
    
    return True, ""


_READABLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # omits 0/O/1/I/L to avoid transcription errors


def generate_temp_password(length: int = 10) -> str:
    """Generate a human-readable temporary password/code (CSPRNG). This is
    only ever hashed and set directly as password_hash, never run through
    validate_password_strength, so no character-class mix is required."""
    return ''.join(secrets.choice(_READABLE_ALPHABET) for _ in range(length))


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
