FROM python:3.12-slim

WORKDIR /app

# WeasyPrint pulls in the Pango/Cairo/GDK-Pixbuf native stack. Without
# these the import succeeds but write_pdf() raises OSError at first call.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fontconfig \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY database/migrations/ ./migrations/

# Create an unprivileged user WITH a real home directory — WeasyPrint's
# fontconfig dependency needs a writable cache dir (normally ~/.cache), and a
# homeless system user makes every render fail with "Fontconfig error: No
# writable cache directories". The entrypoint fixes the media-volume
# ownership (which may be a pre-existing root-owned named volume) as root,
# then drops to this user — so the actual app process never runs as root.
RUN adduser --system --group --home /home/appuser appuser \
    && mkdir -p /app/media /home/appuser/.cache/fontconfig \
    && chown -R appuser:appuser /app /home/appuser \
    && chmod +x /app/docker-entrypoint.sh
ENV HOME=/home/appuser

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
