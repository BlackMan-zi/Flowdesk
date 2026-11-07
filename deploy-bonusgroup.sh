#!/usr/bin/env bash
# Deploy the latest main to the Bonus Group apps server.
#
# From the laptop, anywhere (over Tailscale):
#   ssh william@apps /opt/apps/flowdesk/deploy-bonusgroup.sh
#
# Uses docker-compose.bonusgroup.yml via COMPOSE_FILE in the server's .env.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Rebuilding and restarting changed containers"
docker compose up -d --build

echo "==> Removing old unused images"
docker image prune -f > /dev/null

echo "==> Waiting for the API to answer through nginx"
for _ in $(seq 1 30); do
  if docker exec flowdesk-nginx wget -qO- http://127.0.0.1/api/health 2>/dev/null | grep -q healthy; then
    docker compose ps
    echo "==> Deployed $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 2
done

echo "!! API not healthy after 60s. Last log lines:"
docker logs --tail 30 flowdesk-api
exit 1
