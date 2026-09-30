"""Explicit, backed-up plaintext password migration; never run at app startup."""
import argparse
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.passwords import hash_password, is_password_hash


def migrate(database, backup):
    database = Path(database).resolve(strict=True)
    backup = Path(backup).resolve()
    if database == backup or backup.exists():
        raise ValueError("Backup must be a new file, not the source database")
    with closing(sqlite3.connect(database.as_uri() + "?mode=rw", uri=True)) as connection:
        rows = connection.execute("SELECT id, password_hash FROM accounts").fetchall()
        pending = []
        for uid, value in rows:
            if is_password_hash(value):
                continue
            if not isinstance(value, str) or not value or value.startswith(("scrypt:", "pbkdf2:")):
                raise ValueError("An account has an empty or unrecognized password format; resolve it before migration")
            pending.append((uid, value))
        if not pending:
            return 0
        # Exclusive creation prevents overwriting any existing backup.
        descriptor = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        with closing(sqlite3.connect(backup)) as backup_connection:
            connection.backup(backup_connection)
        with connection:
            for uid, plaintext in pending:
                result = connection.execute(
                    "UPDATE accounts SET password_hash=? WHERE id=? AND password_hash=?",
                    (hash_password(plaintext), uid, plaintext),
                )
                if result.rowcount != 1:
                    raise RuntimeError("Account changed during migration; transaction rolled back")
        return len(pending)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="Existing SQLite database to migrate")
    parser.add_argument("--backup", required=True, help="New private backup file outside the repository")
    options = parser.parse_args()
    count = migrate(options.database, options.backup)
    print(f"Migrated {count} account passwords. No passwords or tokens are printed.")
