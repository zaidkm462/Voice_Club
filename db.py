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


def get_admin_accounts():
    connection = get_db()
    rows = connection.execute(
        """
        SELECT id, full_name, username, created_at
        FROM accounts
        WHERE role = ?
        ORDER BY created_at DESC, id DESC
        """,
        ("admin",),
    ).fetchall()
    return [dict(row) for row in rows]


def promote_user_to_admin(user_id, confirmed_username):
    connection = get_db()
    with connection:
        # The conditional update also protects against stale or repeated requests.
        result = connection.execute(
            """
            UPDATE accounts SET role = 'admin'
            WHERE id = ? AND role = 'user' AND username = ?
            """,
            (user_id, confirmed_username),
        )
        if result.rowcount != 1:
            return None
        row = connection.execute(
            """
            SELECT id, full_name, username, role, created_at
            FROM accounts WHERE id = ?
            """,
            (user_id,),
        ).fetchone()
    return dict(row)


def demote_admin_to_user(admin_id, confirmed_username):
    connection = get_db()
    with connection:
        result = connection.execute(
            """
            UPDATE accounts SET role = 'user'
            WHERE id = ? AND role = 'admin' AND username = ?
            """,
            (admin_id, confirmed_username),
        )
        if result.rowcount != 1:
            return None
        row = connection.execute(
            """
            SELECT id, full_name, username, role, status, created_at
            FROM accounts WHERE id = ?
            """,
            (admin_id,),
        ).fetchone()
    return dict(row)


def get_user_accounts():
    db = get_db()

    rows = db.execute(
        """
        SELECT id, full_name, username, status, created_at
        FROM accounts
        WHERE role = ?
        ORDER BY created_at DESC, id DESC
        """,
        ("user",),
    ).fetchall()
    return [dict(row) for row in rows]


def get_user_account(user_id):
    db = get_db()

    row = db.execute(
        """
        SELECT id, full_name, username, status, created_at
        FROM accounts
        WHERE id = ? AND role = ?
        """,
        (user_id, "user"),
    ).fetchone()

    if row is None:
        return None

    return dict(row)


def get_owned_recording(user_id, recording_id):
    row = get_db().execute(
        """
        SELECT recordings.id, recordings.path, recordings.submitted
        FROM recordings JOIN pdfs ON pdfs.id = recordings.pdf_id
        WHERE recordings.id = ? AND recordings.user_id = ?
          AND (pdfs.owner_user_id IS NULL OR pdfs.owner_user_id = ?)
        """, (recording_id, user_id, user_id),
    ).fetchone()
    return dict(row) if row else None


def submit_user_recording(user_id, recording_id):
    connection = get_db()
    with connection:
        # Serialize submissions so two tabs cannot submit different drafts together.
        connection.execute("BEGIN IMMEDIATE")
        account = connection.execute(
            "SELECT role FROM accounts WHERE id = ?", (user_id,),
        ).fetchone()
        if account is None or account["role"] != "user":
            return "forbidden"
        recording = get_owned_recording(user_id, recording_id)
        if recording is None:
            return "not_found"
        if recording["submitted"] == 1:
            # A retry must not reset an existing admin decision.
            return "submitted"
        existing = connection.execute(
            "SELECT id FROM recordings WHERE user_id = ? AND submitted = 1",
            (user_id,),
        ).fetchone()
        if existing is not None:
            return "conflict"
        connection.execute(
            "UPDATE recordings SET submitted = 1 WHERE id = ? AND user_id = ?",
            (recording_id, user_id),
        )
        connection.execute(
            "UPDATE accounts SET status = 'pending' WHERE id = ?", (user_id,),
        )
    return "submitted"


def get_submitted_recording(user_id):
    db = get_db()

    row = db.execute(
        """
        SELECT
            recordings.id AS recording_id,
            recordings.path AS recording_path,
            recordings.duration_seconds,
            recordings.created_at,
            pdfs.id AS pdf_id,
            pdfs.name AS pdf_name,
            pdfs.original_filename AS pdf_original_filename,
            pdfs.path AS pdf_path
        FROM recordings
        INNER JOIN pdfs
            ON pdfs.id = recordings.pdf_id
        WHERE recordings.user_id = ?
          AND recordings.submitted = 1
        """,
        (user_id,),
    ).fetchone()

    if row is None:
        return None

    return dict(row)

def create_user_account(full_name, username, password):
    db = get_db()

    with db:
        cursor = db.execute(
            """
            INSERT INTO accounts (
                full_name,
                username,
                password_hash,
                role,
                status
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (full_name, username, password, "user", "unsent"),
        )

        user_id = cursor.lastrowid

    return get_user_account(user_id)

def create_user_message(sender_id, recipient_id, title, content):
    db = get_db()

    with db:
        cursor = db.execute(
            """
            INSERT INTO messages (
                sender_id,
                recipient_id,
                title,
                content
            )
            VALUES (?, ?, ?, ?)
            """,
            (sender_id, recipient_id, title, content),
        )

        message_id = cursor.lastrowid

        row = db.execute(
            """
            SELECT
                id,
                sender_id,
                recipient_id,
                title,
                content,
                is_read,
                created_at
            FROM messages
            WHERE id = ?
            """,
            (message_id,),
        ).fetchone()

    return dict(row)

def get_private_pdfs(user_id):
    rows = get_db().execute(
        """
        SELECT id, name, original_filename, path, created_at
        FROM pdfs WHERE owner_user_id = ?
        ORDER BY created_at DESC, id DESC
        """, (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def create_private_pdf(name, original_filename, path, uploaded_by_id, owner_user_id):
    connection = get_db()
    with connection:
        cursor = connection.execute(
            """
            INSERT INTO pdfs(name, original_filename, path, uploaded_by_id, owner_user_id)
            VALUES (?, ?, ?, ?, ?)
            """, (name, original_filename, path, uploaded_by_id, owner_user_id),
        )
        row = connection.execute(
            "SELECT id, name, original_filename, path, created_at FROM pdfs WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)


def get_shared_pdfs():
    db = get_db()

    rows = db.execute(
        """
        SELECT
            id,
            name,
            original_filename,
            path,
            uploaded_by_id,
            created_at
        FROM pdfs
        WHERE owner_user_id IS NULL
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()

    return [dict(row) for row in rows]

def create_shared_pdf(name, original_filename, path, uploaded_by_id):
    db = get_db()

    with db:
        cursor = db.execute(
            """
            INSERT INTO pdfs (
                name,
                original_filename,
                path,
                owner_user_id,
                uploaded_by_id
            )
            VALUES (?, ?, ?, NULL, ?)
            """,
            (name, original_filename, path, uploaded_by_id),
        )

        row = db.execute(
            """
            SELECT
                id,
                name,
                original_filename,
                path,
                uploaded_by_id,
                created_at
            FROM pdfs
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)

def set_user_review_status(user_id, status):
    if status not in ("approved", "rejected"):
        raise ValueError("Invalid review status")

    db = get_db()

    with db:
        cursor = db.execute(
            """
            UPDATE accounts
            SET status = ?
            WHERE id = ?
              AND role = 'user'
              AND EXISTS (
                  SELECT 1
                  FROM recordings
                  WHERE recordings.user_id = accounts.id
                    AND recordings.submitted = 1
              )
            """,
            (status, user_id),
        )

        if cursor.rowcount == 0:
            return None

        user = get_user_account(user_id)

    return user

def get_user_deletion_summary(user_id):
    db = get_db()

    user = get_user_account(user_id)

    if user is None:
        return None

    row = db.execute(
        """
        SELECT
            (
                SELECT COUNT(*)
                FROM pdfs
                WHERE owner_user_id = :user_id
            ) AS private_pdfs,
            (
                SELECT COUNT(*)
                FROM recordings
                WHERE user_id = :user_id
                   OR pdf_id IN (
                       SELECT id
                       FROM pdfs
                       WHERE owner_user_id = :user_id
                   )
            ) AS recordings,
            (
                SELECT COUNT(*)
                FROM messages
                WHERE sender_id = :user_id
                   OR recipient_id = :user_id
            ) AS messages,
            (
                SELECT COUNT(*)
                FROM auth_tokens
                WHERE account_id = :user_id
            ) AS sessions
        """,
        {"user_id": user_id},
    ).fetchone()

    return {
        "user": user,
        "affected_records": dict(row),
    }

def delete_user_account(user_id, confirmed_username):
    db = get_db()

    with db:
        db.execute("BEGIN IMMEDIATE")

        user = get_user_account(user_id)

        if user is None:
            return None

        if confirmed_username != user["username"]:
            raise ValueError("Username confirmation does not match")

        files = db.execute(
            """
            SELECT path
            FROM pdfs
            WHERE owner_user_id = :user_id

            UNION

            SELECT path
            FROM recordings
            WHERE user_id = :user_id
               OR pdf_id IN (
                   SELECT id
                   FROM pdfs
                   WHERE owner_user_id = :user_id
               )
            """,
            {"user_id": user_id},
        ).fetchall()

        db.execute(
            """
            DELETE FROM accounts
            WHERE id = ? AND role = 'user'
            """,
            (user_id,),
        )

        unreferenced_paths = []

        for file in files:
            path = file["path"]

            remaining_reference = db.execute(
                """
                SELECT 1 FROM pdfs WHERE path = ?
                UNION ALL
                SELECT 1 FROM recordings WHERE path = ?
                LIMIT 1
                """,
                (path, path),
            ).fetchone()

            if remaining_reference is None:
                unreferenced_paths.append(path)

    return {
        "deleted_user_id": user_id,
        "file_cleanup_candidates": unreferenced_paths,
    }
