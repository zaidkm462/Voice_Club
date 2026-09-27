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
        original_filename TEXT NOT NULL,
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

        submitted INTEGER NOT NULL DEFAULT 0
            CHECK (submitted IN (0, 1)),

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES accounts(id)
            ON DELETE CASCADE,

        FOREIGN KEY (pdf_id)
            REFERENCES pdfs(id)
            ON DELETE CASCADE
    );


    CREATE TABLE "messages" (
	"id"	INTEGER,
	"sender_id"	INTEGER NOT NULL,
	"recipient_id"	INTEGER NOT NULL,
	"content"	TEXT NOT NULL,
	"is_read"	INTEGER NOT NULL DEFAULT 0 CHECK("is_read" IN (0, 1)),
	"created_at"	TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"title"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("recipient_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
	FOREIGN KEY("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);


    CREATE UNIQUE INDEX IF NOT EXISTS
        idx_one_submitted_recording_per_user
    ON recordings(user_id)
    WHERE submitted = 1;


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

    conn.commit()
    conn.close()

    print("Database initialized successfully.")


if __name__ == "__main__":
    init_database()