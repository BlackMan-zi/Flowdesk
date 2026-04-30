# Fix: Docker Shared Network Hostname Collisions

When multiple Docker Compose stacks share a single external network (e.g. `bsc_network`),
generic service aliases like `db`, `backend`, or `api` become ambiguous — requests resolve
to whichever container answers first, which is often the wrong one from another stack.

This guide documents the two fixes applied to the Inventory system and how to replicate
them for any other stack on the same server.

---

## The Problem

You have multiple stacks all connected to `bsc_network`:

| Stack | DB container | Backend container |
|-------|-------------|-------------------|
| bsc-stack | `bsc-stack-db-1` | `bsc-stack-backend-1` |
| inventory | `inventory_db` | `inventory_backend` |
| flowdesk | `flowdesk_db` | `flowdesk_backend` |

Every container on `bsc_network` can see every other container.
When your backend connects to `db:5432`, Docker picks **any** container
whose service is named `db` — not necessarily yours.

**Symptoms:**
- Password authentication failures (connecting to the wrong database)
- API endpoints returning 404 or 500 (nginx proxying to the wrong backend)
- Pages showing "Failed to load data" even though your own backend logs look fine
- Spending hours debugging pg_hba.conf / passwords on the **wrong** container

---

## Fix 1 — Database connection string

In each stack's `docker-compose.yml`, the backend service must connect to the database
using its **container name**, not the generic service alias.

```yaml
# BAD — resolves to whichever "db" container answers on bsc_network
DATABASE_URL: postgresql://user:pass@db:5432/mydb

# GOOD — resolves only to this stack's database container
DATABASE_URL: postgresql://user:pass@mystack_db:5432/mydb
```

The target hostname must match the `container_name:` value defined in the same
`docker-compose.yml`, for example:

```yaml
services:
  db:
    image: postgres:15
    container_name: mystack_db   # <-- this is the unique hostname to use
    ...

  backend:
    environment:
      DATABASE_URL: postgresql://user:pass@mystack_db:5432/mydb  # <-- matches above
```

---

## Fix 2 — nginx reverse proxy

Each stack's frontend nginx config must proxy API requests to the backend using
its **container name**, not the generic service name.

```nginx
# BAD — resolves to whichever "backend" container answers on bsc_network
location /api/ {
    proxy_pass http://backend:8000;
}

# GOOD — resolves only to this stack's backend container
location /api/ {
    proxy_pass http://mystack_backend:8000;
}
```

The hostname must match the `container_name:` of the backend service:

```yaml
services:
  backend:
    container_name: mystack_backend   # <-- this is the unique hostname to use
```

---

## Checklist for each new stack

Go through these two files for every stack you set up on this server:

- [ ] `docker-compose.yml` — every service that references another service by hostname
      uses `container_name` values, not generic service names (`db`, `backend`, `api`, etc.)
- [ ] `frontend/nginx.conf` (or wherever the reverse proxy config lives) —
      `proxy_pass` targets use the explicit container name

---

## How to find the right container names

On the server, run:

```bash
docker network inspect bsc_network
```

This lists every container on the shared network with its name and IP address.
Use those names in your configs.

To check which container a hostname is currently resolving to from inside a running container:

```bash
docker exec -it <your_backend_container> getent hosts db
# or
docker exec -it <your_backend_container> ping -c1 backend
```

---

## Example: Inventory system (already fixed)

| Config file | Before | After |
|-------------|--------|-------|
| `docker-compose.yml` → `DATABASE_URL` | `@db:5432` | `@inventory_db:5432` |
| `frontend/nginx.conf` → `proxy_pass` | `http://backend:8000` | `http://inventory_backend:8000` |

---

## Rule of thumb

> On any shared Docker network, always use `container_name` (globally unique across all stacks)
> instead of service name aliases (which collide across stacks).
