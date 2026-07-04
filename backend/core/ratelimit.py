"""Shared rate limiter, keyed by client IP.

Extracted into its own module (rather than defined inline in main.py) so
routers can import and decorate individual endpoints — e.g. tighter limits on
/auth/login than on the app at large — without a circular import on main.
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
