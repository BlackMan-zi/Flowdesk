"""In-process pub/sub keyed by organisation.

Each open SSE connection subscribes for its caller's organisation_id and
receives a small JSON payload whenever a workflow event is published (an
approval is taken, a form is submitted/resubmitted, etc.).

Implementation notes:
- Queues are bounded (max_queue). If a slow consumer falls behind we drop
  the oldest event for that consumer rather than blocking publishers or
  letting the process OOM.
- `publish` is plain-sync and thread-safe: callable from anywhere in
  the codebase (request handlers, BackgroundTasks, scheduler jobs).
- The SSE generator reads with `await asyncio.to_thread(q.get, ...)` so
  the asyncio event loop is never blocked on the queue.
"""

import logging
import queue
from collections import defaultdict
from threading import Lock
from typing import Dict, Set

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self, max_queue: int = 100):
        self._subs: Dict[str, Set[queue.Queue]] = defaultdict(set)
        self._lock = Lock()
        self._max_queue = max_queue

    def subscribe(self, org_id: str) -> queue.Queue:
        q = queue.Queue(maxsize=self._max_queue)
        with self._lock:
            self._subs[org_id].add(q)
        return q

    def unsubscribe(self, org_id: str, q: queue.Queue) -> None:
        with self._lock:
            self._subs[org_id].discard(q)
            if not self._subs[org_id]:
                del self._subs[org_id]

    def publish(self, org_id: str, event: dict) -> None:
        with self._lock:
            subs = list(self._subs.get(org_id, ()))
        if not subs:
            return
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                # Drop oldest, then try again. If still full, give up on this
                # one; better to skip an event than block the publisher.
                try:
                    q.get_nowait()
                except queue.Empty:
                    pass
                try:
                    q.put_nowait(event)
                except queue.Full:
                    logger.warning("[EventBus] dropping event for slow subscriber on org %s", org_id)


bus = EventBus()
