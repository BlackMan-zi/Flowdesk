"""Reset every user's password in the database to a chosen value.

ONE-OFF MAINTENANCE SCRIPT. Run this manually inside the API container.

Usage (inside the running flowdesk-api container, WORKDIR /app):
    python /app/scripts/reset_all_passwords.py
    # ...or with a custom password:
    python /app/scripts/reset_all_passwords.py 'AnotherPass@2025'

What it does:
- Hashes the password with bcrypt (cost 12), matching `hash_password()`.
- Updates every row in the `users` table.
- Clears `must_reset_password` so users can sign in directly (no force-reset).
- Clears `temp_password` so any old temp credentials are voided.
- Prints how many rows were updated.

Reads DATABASE_URL from the container env (already set by docker compose).
"""

import os
import sys

import bcrypt
from sqlalchemy import create_engine, text


DEFAULT_PASSWORD = "FlowDesk@2024"


def main() -> int:
    password = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PASSWORD
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set in this container.", file=sys.stderr)
        return 1

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")

    engine = create_engine(database_url)
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE users SET "
                "password_hash = :h, "
                "must_reset_password = FALSE, "
                "temp_password = NULL"
            ),
            {"h": hashed},
        )
        print(f"Reset {result.rowcount} user password(s) to: {password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
