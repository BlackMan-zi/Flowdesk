#!/bin/sh
set -e
# The media volume may be a pre-existing root-owned named volume. Ensure the
# unprivileged app user can write to it, then drop privileges to run the app.
# The app process itself never runs as root.
if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/media
    chown -R appuser:appuser /app/media 2>/dev/null || true
    exec runuser -u appuser -- "$@"
fi
exec "$@"
