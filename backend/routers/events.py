"""Server-Sent Events stream, replacing 1-second polling on
My Forms / Approvals / Documents / Dashboard.

Every connected browser opens GET /events/stream?token=<jwt>. The api
holds the connection open and writes a chunk whenever a workflow event
is published for that user's organisation. The frontend invalidates
React Query caches on receipt; React Query then refetches just the
queries that page actually uses.

EventSource can't send Authorization headers, so the access token
travels in the query string, using the same JWT, same expiry, same secret.
"""

import asyncio
import json
import logging
import queue
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from core.security import decode_token
from models.user import User, UserStatus
from services.event_bus import bus

router = APIRouter(prefix="/events", tags=["Events"])
logger = logging.getLogger(__name__)

# Pause between keepalive comments. Must be shorter than the shortest
# idle timeout in any proxy in front of us (nginx default is 60s).
KEEPALIVE_SECONDS = 25


async def _event_stream(org_id: str, request: Request):
    q = bus.subscribe(org_id)
    try:
        # Initial hello so the client knows the stream is live.
        yield f"event: hello\ndata: {json.dumps({'org_id': org_id})}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.to_thread(q.get, True, KEEPALIVE_SECONDS)
            except queue.Empty:
                # Comment-only line, keeps the connection alive through
                # idle-timeout-aware proxies without surfacing as an event.
                yield ": keepalive\n\n"
                continue
            evt_type = event.get("type", "message")
            yield f"event: {evt_type}\ndata: {json.dumps(event)}\n\n"
    finally:
        bus.unsubscribe(org_id, q)


@router.get("/stream")
async def stream(
    request: Request,
    token: str = Query(..., description="Bearer JWT (same as Authorization header)"),
    db: Session = Depends(get_db),
):
    """SSE endpoint. Frontend opens via EventSource: no custom headers
    available there, hence ?token=…"""
    try:
        payload = decode_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    if not user_id or not org_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == org_id,
    ).first()
    if not user or user.status == UserStatus.not_active:
        raise HTTPException(status_code=401, detail="User not authorised")

    return StreamingResponse(
        _event_stream(org_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
