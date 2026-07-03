"""Shared rate limiter.

Used to throttle authentication endpoints (login, MFA verify, password reset)
so passwords and TOTP codes cannot be brute-forced. Keyed by client IP, taking
the first X-Forwarded-For hop into account since the app runs behind nginx.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First entry is the original client; nginx appends its own hop.
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)
