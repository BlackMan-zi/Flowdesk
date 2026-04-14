import secrets
import string
import pyotp
import qrcode
import io
import base64
from passlib.context import CryptContext
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def generate_temp_password(length: int = 12) -> str:
    """Generate a secure temporary password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure it has at least one of each character type
        if (any(c.islower() for c in password)
                and any(c.isupper() for c in password)
                and any(c.isdigit() for c in password)):
            return password


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
