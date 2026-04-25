# 🔄 Migration Guide: Update Routers for Rate Limiting

This guide shows how to add rate limiting decorators to your routers.

---

## Quick Start

### Before:
```python
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ...
```

### After:
```python
from fastapi import Request
from main import limiter

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,  # ← Add this parameter
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    ...
```

---

## What's Changed

1. **Import the limiter**: `from main import limiter`
2. **Add the decorator**: `@limiter.limit("X/minute")`
3. **Add request parameter**: `request: Request` as first parameter

---

## Recommended Rate Limits by Endpoint Type

### Auth Endpoints (Strict - prevent brute force)
```python
@limiter.limit("5/minute")  # 5 requests per minute per IP
def login(...):
    ...

@limiter.limit("3/minute")
def verify_mfa(...):
    ...

@limiter.limit("10/minute")
def forgot_password(...):
    ...
```

### Read Endpoints (Moderate)
```python
@limiter.limit("100/minute")  # 100 requests per minute per IP
def list_documents(...):
    ...

@limiter.limit("100/minute")
def get_pending_approvals(...):
    ...
```

### Write Endpoints (Moderate)
```python
@limiter.limit("50/minute")  # 50 requests per minute per IP
def create_approval(...):
    ...

@limiter.limit("30/minute")
def upload_document(...):
    ...
```

### Admin/Sensitive Endpoints (Very Strict)
```python
@limiter.limit("10/minute")  # 10 requests per minute per IP
def create_user(...):
    ...

@limiter.limit("5/minute")
def delete_organization(...):
    ...
```

### Health/System Endpoints (Relaxed)
```python
@limiter.limit("1000/minute")  # High limit for monitoring
def health(...):
    ...

@limiter.limit("100/minute")
def get_metrics(...):
    ...
```

---

## Step-by-Step Migration

### Step 1: Update Imports in Each Router

```python
# routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, status, Request  # ← Add Request
from main import limiter  # ← Add this import
```

### Step 2: Add Decorator and Request Parameter

**Auth Router** (`routers/auth.py`):
```python
@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,  # ← Add
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    ...

@router.post("/mfa/verify")
@limiter.limit("3/minute")
def verify_mfa(
    request: Request,  # ← Add
    payload: MFAVerifyRequest,
    db: Session = Depends(get_db)
):
    ...

@router.post("/force-reset-password")
@limiter.limit("10/minute")
async def force_reset_password(
    request: Request,  # ← Add
    payload: ForcePasswordResetRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...
```

**Approvals Router** (`routers/approvals.py`):
```python
@router.get("/pending")
@limiter.limit("100/minute")
def get_pending_approvals(
    request: Request,  # ← Add
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...

@router.post("/{form_instance_id}/approve")
@limiter.limit("50/minute")
def approve(
    request: Request,  # ← Add
    form_instance_id: str,
    payload: ApprovalActionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...
```

**Documents Router** (`routers/documents.py`):
```python
@router.get("/{form_instance_id}/download")
@limiter.limit("100/minute")
def download_document(
    request: Request,  # ← Add
    form_instance_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...

@router.get("")
@limiter.limit("100/minute")
def list_documents(
    request: Request,  # ← Add
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...
```

---

## Testing Rate Limits

### Test with curl:
```bash
# Try to hit endpoint 6 times in quick succession
for i in {1..6}; do 
    curl -i http://localhost:8000/health
    echo "Request $i"
done

# Output:
# Request 1: 200 OK
# Request 2: 200 OK
# Request 3: 200 OK
# Request 4: 200 OK
# Request 5: 200 OK
# Request 6: 429 Too Many Requests
```

### Response when rate-limited:
```json
{
    "error": "Rate limit exceeded",
    "detail": "1000 per 1 minute",
    "retry_after": "60"
}
```

### Test with Python:
```python
import requests
import time

endpoint = "http://localhost:8000/auth/login"
headers = {
    "Content-Type": "application/json"
}

for i in range(6):
    resp = requests.post(
        endpoint,
        json={"email": "test@example.com", "password": "Test123!"},
        headers=headers
    )
    print(f"Request {i+1}: {resp.status_code}")
    time.sleep(0.1)
```

---

## Rate Limiting by Authenticated User (Optional)

For more sophisticated rate limiting by user ID instead of IP:

```python
from slowapi.util import get_remote_address

def get_rate_limit_key(request: Request, current_user: User = Depends(get_current_active_user)):
    """Rate limit by user ID instead of IP for authenticated endpoints."""
    return f"user:{current_user.id}"

@router.post("/approvals/{id}")
@limiter.limit("50/minute", key_func=get_rate_limit_key)
def approve_request(
    request: Request,
    id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...
```

---

## Dynamic Rate Limits (Advanced)

Adjust limits based on user role:

```python
def get_user_rate_limit(request: Request, current_user: User = Depends(get_current_active_user)):
    """Admins get higher rate limits."""
    if is_admin(current_user):
        return "1000/minute"
    else:
        return "100/minute"

@router.get("/forms")
def list_forms(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if is_admin(current_user):
        # Admin gets higher limit
        limiter.limit("1000/minute")(lambda: None)
    else:
        limiter.limit("100/minute")(lambda: None)
    ...
```

---

## Monitoring Rate Limits

### Log rate limit hits:
```python
# In main.py

from slowapi.errors import RateLimitExceeded
import logging

logger = logging.getLogger(__name__)

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(
        f"Rate limit exceeded: {request.client.host} "
        f"endpoint: {request.url.path} "
        f"limit: {exc.detail}"
    )
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": str(exc.detail),
            "retry_after": exc.headers.get("Retry-After", "60")
        }
    )
```

### Alert on high rate limit hits:
```python
# In monitoring/alerting system
if requests_with_status_429 > 100:
    send_alert("High rate limiting detected - possible attack or load issue")
```

---

## Common Mistakes

### ❌ Wrong: Forgetting Request parameter
```python
@limiter.limit("100/minute")
def list_documents(
    current_user: User = Depends(get_current_active_user),  # ← Missing 'request' before this
    db: Session = Depends(get_db)
):
    ...
```

### ✅ Correct:
```python
@limiter.limit("100/minute")
def list_documents(
    request: Request,  # ← Add this
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ...
```

### ❌ Wrong: Import path
```python
from slowapi import limiter  # ← Won't work
```

### ✅ Correct:
```python
from main import limiter  # ← Import from main.py
```

### ❌ Wrong: Forgetting to import Request
```python
from fastapi import APIRouter, Depends
```

### ✅ Correct:
```python
from fastapi import APIRouter, Depends, Request  # ← Add Request
```

---

## Rollout Strategy

### Phase 1: Auth Endpoints (Critical)
- Apply strict rate limits to login, MFA, password reset
- Deploy and monitor for false positives

### Phase 2: Write Endpoints (Important)
- Apply moderate rate limits to create/update/delete
- Deploy and monitor

### Phase 3: Read Endpoints (Nice to have)
- Apply moderate rate limits to list/get
- Deploy and monitor

### Phase 4: Fine-tuning
- Adjust limits based on real traffic patterns
- Add role-based limits if needed

---

## Rollback

If rate limiting causes issues:

```python
# Temporarily increase or disable
@limiter.limit("10000/minute")  # Very high limit
def login(...):
    ...

# Or use environment variable
from config import settings

limit = settings.AUTH_RATE_LIMIT if settings.ENVIRONMENT == "production" else "10000/minute"

@limiter.limit(limit)
def login(...):
    ...
```

---

## Testing Checklist

- [ ] Test auth endpoints are rate limited
- [ ] Test read endpoints are rate limited
- [ ] Test write endpoints are rate limited
- [ ] Verify 429 response format
- [ ] Verify retry-after header
- [ ] Test rate limit recovery after 1 minute
- [ ] Test with multiple IPs (from different machines)
- [ ] Load test to verify limits work under load

---

**Status**: Implementation guide ready  
**Effort**: 30-60 minutes to update all routers  
**Risk**: Low (decorators only, no logic changes)
