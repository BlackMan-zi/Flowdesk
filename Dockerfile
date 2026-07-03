FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    gcc \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create an unprivileged user. The entrypoint fixes the media-volume ownership
# (which may be a pre-existing root-owned named volume) as root, then drops to
# this user — so the actual app process never runs as root.
RUN adduser --system --group --no-create-home appuser \
    && mkdir -p /app/media \
    && chown -R appuser:appuser /app \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No --reload in production: the reloader is a dev-only file watcher with extra
# attack surface and overhead. Use multiple workers instead.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
