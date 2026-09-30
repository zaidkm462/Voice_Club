import sqlite3
from pathlib import Path

DB_PATH = Path("competition.db")


def init_database():
    conn = sqlite3.connect(DB_PATH)

    conn.execute("PRAGMA foreign_keys = ON")

    conn.executescript("""
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,

        role TEXT NOT NULL
            CHECK (role IN ('user', 'admin', 'owner')),

        status TEXT NOT NULL DEFAULT 'approved'
            CHECK (status IN ('unsent', 'pending', 'approved', 'rejected')),

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );


    CREATE TABLE IF NOT EXISTS pdfs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,
        original_filename TEXT,
        path TEXT NOT NULL,

        owner_user_id INTEGER,
        uploaded_by_id INTEGER,

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (owner_user_id)
            REFERENCES accounts(id)
            ON DELETE CASCADE,

        FOREIGN KEY (uploaded_by_id)
            REFERENCES accounts(id)
            ON DELETE SET NULL
    );


    CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        user_id INTEGER NOT NULL,
        pdf_id INTEGER NOT NULL,

        path TEXT NOT NULL,

        duration_seconds INTEGER,

        status TEXT NOT NULL DEFAULT 'unsent'
            CHECK (status IN ('unsent', 'pending', 'approved', 'rejected')),

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES accounts(id)
            ON DELETE CASCADE,

        FOREIGN KEY (pdf_id)
            REFERENCES pdfs(id)
            ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS "messages" (
	"id"	INTEGER,
	"sender_id"	INTEGER NOT NULL,
	"recipient_id"	INTEGER NOT NULL,
	"recipient_scope"	TEXT,
	"content"	TEXT NOT NULL,
	"is_read"	INTEGER NOT NULL DEFAULT 0 CHECK("is_read" IN (0, 1)),
	"created_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"title"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("recipient_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
	FOREIGN KEY("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);


    DROP INDEX IF EXISTS idx_one_submitted_recording_per_user;


    CREATE INDEX IF NOT EXISTS idx_recordings_user
    ON recordings(user_id);


    CREATE INDEX IF NOT EXISTS idx_recordings_pdf
    ON recordings(pdf_id);


    CREATE INDEX IF NOT EXISTS idx_messages_recipient
    ON messages(recipient_id);
    
    CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    token_hash TEXT NOT NULL UNIQUE,

    account_id INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    expires_at TEXT,

    FOREIGN KEY (account_id)
        REFERENCES accounts(id)
        ON DELETE CASCADE
);
    
    """)

    recording_columns = {row[1] for row in conn.execute("PRAGMA table_info(recordings)")}
    if "status" not in recording_columns:
        conn.execute("ALTER TABLE recordings ADD COLUMN status TEXT NOT NULL DEFAULT 'unsent'")
    if "submitted" in recording_columns:
        conn.execute("""
            UPDATE recordings
            SET status = CASE
                WHEN submitted = 0 THEN 'unsent'
                WHEN (SELECT status FROM accounts WHERE accounts.id = recordings.user_id)
                     IN ('approved', 'rejected')
                    THEN (SELECT status FROM accounts WHERE accounts.id = recordings.user_id)
                ELSE 'pending'
            END
            WHERE submitted = 1
        """)
    if "submitted" in recording_columns:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("ALTER TABLE recordings RENAME TO recordings_legacy")
        conn.execute("""
            CREATE TABLE recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                pdf_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                duration_seconds INTEGER,
                status TEXT NOT NULL DEFAULT 'unsent'
                    CHECK (status IN ('unsent', 'pending', 'approved', 'rejected')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            INSERT INTO recordings
                (id, user_id, pdf_id, path, duration_seconds, status, created_at)
            SELECT id, user_id, pdf_id, path, duration_seconds, status, created_at
            FROM recordings_legacy
        """)
        conn.execute("DROP TABLE recordings_legacy")
        conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_recordings_status_user
        ON recordings(user_id, status)
    """)

    message_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(messages)")
    }
    if "recipient_scope" not in message_columns:
        conn.execute("ALTER TABLE messages ADD COLUMN recipient_scope TEXT")
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_scope
        ON messages(recipient_scope)
    """)

    conn.commit()
    conn.close()

    print("Database initialized successfully.")


if __name__ == "__main__":
    init_database()