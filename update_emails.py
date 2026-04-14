"""
Update user emails to correct @bsc.rw addresses from emails.csv
Run inside Docker: docker exec flowdesk-api-1 sh -c "python3 //app/update_emails.py"
"""
import sys
sys.path.insert(0, '/app')

from sqlalchemy import create_engine, text
import os

db_url = os.environ.get('DATABASE_URL', 'mysql+pymysql://flowdesk:flowdesk@db:3306/flowdesk')
engine = create_engine(db_url)

# Explicit overrides: DB user name → correct email
# (cases where the CSV display name differs from the seeded name)
EXPLICIT = {
    'Alexis Habarimana':       'alex.habarimana@bsc.rw',        # CSV: Alex Habarimana
    'Amza Mbaraga':            'hamza.mbaraga@bsc.rw',           # CSV: Hamza Mbaraga
    'Elimine Kwizera':         'elimine.gashirabake@bsc.rw',     # CSV: Gashirabake Elimine
    'Ingrid Iradukunda':       'aristide.iradukunda@bsc.rw',     # CSV: Ingrid Rai Aristide IRADUKUNDA
    'Jean Claude Karemera':    'claude.karemera@bsc.rw',         # CSV: Claude Karemera
    'Jean Claude Ngoga':       'merci.ngoga@bsc.rw',             # CSV: Merci Ngoga
    'Jean de Dieu Tuyishime':  'jeandedieu.tuyishime@bsc.rw',    # CSV: Jean De DieuTuyishime
    'Patrick Sengabo':         'patrick.rubayita@bsc.rw',        # CSV: Patrick Sengabo Rubayita
    'Bon Coeur Habiyakare':    'boncoeur.habiyakare@bsc.rw',     # CSV email prefix differs
    'Alain Cedrick Manzi':     'alain.manzi@bsc.rw',             # CSV: Alain  Cedrick Manzi
}

updated = 0
skipped = 0
not_found = []

with engine.connect() as conn:
    rows = conn.execute(text("SELECT id, name, email FROM users WHERE email LIKE '%@bscrwanda.rw'")).fetchall()
    print(f"Found {len(rows)} users with @bscrwanda.rw emails\n")

    for user_id, name, old_email in rows:
        if name in EXPLICIT:
            new_email = EXPLICIT[name]
        else:
            # Simple domain swap
            new_email = old_email.replace('@bscrwanda.rw', '@bsc.rw')

        if new_email == old_email:
            skipped += 1
            continue

        conn.execute(
            text("UPDATE users SET email = :new WHERE id = :uid"),
            {"new": new_email, "uid": user_id}
        )
        print(f"  {name:<40} {old_email:<45} → {new_email}")
        updated += 1

    conn.commit()

print(f"\n{'='*60}")
print(f"Updated : {updated}")
print(f"Skipped : {skipped} (no change needed)")
print(f"Done.")
