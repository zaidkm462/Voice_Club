"""Password regression tests using only a disposable database."""
import contextlib
import io
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


def main():
    with tempfile.TemporaryDirectory(prefix="voice-passwords-") as temporary:
        import config

        root = Path(temporary)
        config.DATABASE = str(root / "test.db")
        config.STORAGE_DIR = str(root / "media")
        config.PDF_DIR = str(root / "media" / "pdfs")
        config.RECORDING_DIR = str(root / "media" / "recordings")
        from app import create_app, db
        from app.passwords import hash_password, verify_password
        from migrate_passwords import migrate

        secret = "  تجربة-Password-123  "
        first, second = hash_password(secret), hash_password(secret)
        assert first != second and first != secret
        assert verify_password(first, secret)
        assert not verify_password(first, secret.strip())
        assert not verify_password(first, "wrong")
        assert not verify_password(secret, secret)
        assert not verify_password("scrypt:bad$bad$bad", secret)

        with contextlib.closing(sqlite3.connect(config.DATABASE)) as connection:
            connection.executescript("""
                CREATE TABLE accounts (
                    id INTEGER PRIMARY KEY, full_name TEXT, username TEXT UNIQUE,
                    password_hash TEXT, role TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE auth_tokens (
                    id INTEGER PRIMARY KEY, account_id INTEGER, token_hash TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at TEXT
                );
                CREATE TABLE untouched_audition (id INTEGER PRIMARY KEY, note TEXT);
                INSERT INTO untouched_audition VALUES (1, 'must remain unchanged');
            """)
            with connection:
                for uid, role in ((1, "owner"), (2, "admin"), (3, "user")):
                    connection.execute("INSERT INTO accounts(id,full_name,username,password_hash,role,status) VALUES(?,?,?,?,?,?)",
                                       (uid, "Test", f"test{uid}", secret, role, "unsent"))
                connection.execute("INSERT INTO accounts(id,full_name,username,password_hash,role,status) VALUES(4,'Hashed','hashed',?,'user','unsent')", (first,))

        app = create_app()
        app.testing = True
        app.teardown_appcontext(db.close_db)
        client = app.test_client(use_cookies=False)
        endpoint = "/api/login"
        assert client.post(endpoint, json={"username": "test1", "password": secret}).status_code == 401
        backup = root / "backup.sqlite"
        assert migrate(config.DATABASE, backup) == 3
        with contextlib.closing(sqlite3.connect(backup)) as connection:
            assert connection.execute("SELECT password_hash FROM accounts WHERE id=1").fetchone()[0] == secret
        with contextlib.closing(sqlite3.connect(config.DATABASE)) as connection:
            assert connection.execute("SELECT password_hash FROM accounts WHERE id=4").fetchone()[0] == first
            assert connection.execute("SELECT note FROM untouched_audition").fetchone()[0] == 'must remain unchanged'
        assert migrate(config.DATABASE, root / "second.sqlite") == 0
        assert not (root / "second.sqlite").exists()
        try:
            migrate(config.DATABASE, backup)
            raise AssertionError("Must refuse existing backup")
        except ValueError:
            pass

        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            for uid, role in ((1, "owner"), (2, "admin"), (3, "user")):
                response = client.post(endpoint, json={"username": f"test{uid}", "password": secret})
                assert response.status_code == 200, response.get_json()
                assert response.get_json()["redirect_url"] == f"/{role}/dashboard"
                assert response.get_json()["auth_token"] not in captured.getvalue()
        assert captured.getvalue() == ""
        assert client.post(endpoint, json={"username": "test1", "password": "wrong"}).status_code == 401
        assert client.post(endpoint, json={"username": "unknown", "password": secret}).status_code == 401
        for body in ([], "text", 1, {}, {"username": [], "password": secret}, {"username": "test1", "password": {}}):
            assert client.post(endpoint, json=body).status_code == 400
        assert client.post(endpoint, data="{", content_type="application/json").status_code == 400

        # Use the actual admin account-creation route, not just the helper.
        login = client.post(endpoint, json={"username": "test2", "password": secret})
        token = login.get_json()["auth_token"]
        created = client.post("/api/admin/users", json={
            "full_name": "New contestant", "username": "new", "password": secret
        }, headers={"Authorization": f"Bearer {token}"})
        assert created.status_code == 201, created.get_json()
        assert "password_hash" not in created.get_json()["user"]
        with contextlib.closing(sqlite3.connect(config.DATABASE)) as connection:
            stored = connection.execute("SELECT password_hash FROM accounts WHERE username='new'").fetchone()[0]
            assert stored != secret and verify_password(stored, secret)
        assert client.post(endpoint, json={"username": "new", "password": secret}).status_code == 200
        print("PASS: salted hashes, all-role login, invalid requests, account creation, migration, backup and no token logging")


if __name__ == "__main__":
    main()
