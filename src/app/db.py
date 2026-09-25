import sqlite3

from flask import g

from  src.config import DATABASE


def get_db_test():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")

    return g.db

def check_login(username, password):
    global g
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM accounts WHERE username = ? and password_hash=?", (username, password))
    x = cur.fetchone()
    if not x:
        g.user = None
    else:
        g.user = x
    return g

def close_db(error=None):
    db = g.pop("db", None)

    if db is not None:
        db.close()

def insert_token(id, token):
    print("id: ", id, " token: ", token)
    conn = get_db()
    conn.cursor().execute(
            "INSERT INTO auth_tokens (account_id, token_hash) VALUES (?, ?)",
            (id, token)
        )
    conn.commit()

def get_messages(uid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, title, content, is_read, created_at FROM messages WHERE recipient_id = ?", (uid,))
    x = cur.fetchall()
    return [tuple(i) for i in x]

def get_recordings(uid):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT recordings.id, recordings.path, pdfs.path, duration_seconds,
                        submitted, recordings.created_at FROM recordings INNER JOIN pdfs
                        ON recordings.pdf_id = pdfs.id where recordings.user_id=?;""", (uid,))
    x = cur.fetchall()
    return [tuple(i) for i in x]


