from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from config import settings
from models.user import User, UserStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    # iat lets us invalidate tokens issued before a password change (see
    # get_current_user's password_changed_at check below).
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_mfa_pending_token(data: dict) -> str:
    """Short-lived token issued when /auth/login's MFA branch fires. Tagged
    type="mfa_pending" so get_current_user's type check (below) structurally
    rejects it everywhere except the dedicated MFA setup/enable/verify
    routes — it can never be used as a real session token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.MFA_PENDING_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now, "type": "mfa_pending"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        # Pin the algorithm explicitly: never trust the token header's "alg",
        # which is what algorithm-confusion attacks abuse.
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    # Only genuine access tokens grant a session; reject refresh tokens
    # presented as bearer credentials.
    if payload.get("type") != "access":
        raise credentials_exception
    user_id: str = payload.get("sub")
    org_id: str = payload.get("org_id")
    if not user_id or not org_id:
        raise credentials_exception

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == org_id
    ).first()
    if not user:
        raise credentials_exception

    # Invalidate any token minted before the user's most recent password
    # change, so a stolen/old token stops working the moment the password is
    # rotated. Tokens issued before this field existed have no iat/timestamp
    # to compare, so they are naturally exempt until the user's next reset.
    if user.password_changed_at is not None:
        iat = payload.get("iat")
        if iat is None:
            raise credentials_exception
        iat_dt = datetime.fromtimestamp(int(iat), tz=timezone.utc)
        pwd_changed = user.password_changed_at
        if pwd_changed.tzinfo is None:
            pwd_changed = pwd_changed.replace(tzinfo=timezone.utc)
        # Compare at whole-second granularity (JWT iat is integer seconds): a
        # token minted in an earlier second than the password change is
        # rejected, while a token freshly issued in the same second (e.g. the
        # one force-reset-password hands back) stays valid.
        if iat_dt < pwd_changed.replace(microsecond=0):
            raise credentials_exception
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if current_user.status == UserStatus.not_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )
    return current_user


async def get_mfa_pending_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Auth dependency for the three MFA completion routes. Accepts ONLY an
    mfa_pending token (never a real access token), scoped to the login that
    issued it."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired MFA session. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload.get("type") != "mfa_pending":
        raise credentials_exception
    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    if not user_id or not org_id:
        raise credentials_exception

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == org_id
    ).first()
    if not user:
        raise credentials_exception
    if user.status == UserStatus.not_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")
    return user


async def require_password_reset_complete(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Gate for business endpoints: a user who still owes a forced password
    change may authenticate (to hit /auth/me and /auth/force-reset-password)
    but cannot touch application data until they rotate the starter
    password."""
    if current_user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password reset required before continuing",
        )
    return current_user
