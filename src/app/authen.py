import hashlib
import secrets

from flask import g, request

from app.db import get_db


def generate_token():
    return secrets.token_urlsafe(32)


def hash_token(token):
    return token
    return hashlib.sha256(token.encode()).hexdigest()

def authenticate():
    g.user = None
    token = None

    auth_header = request.headers.get("Authorization")

    if auth_header:
        parts = auth_header.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        else:
            return
    else:
        token = request.cookies.get("auth_token")

    if not token:
        return

    token_hash = token
    db = get_db()

    user = db.execute(
        """
        SELECT accounts.*
        FROM auth_tokens
        JOIN accounts
            ON accounts.id = auth_tokens.account_id
        WHERE auth_tokens.token_hash = ?
        """,
        (token_hash,)
    ).fetchone()

    if user:
        g.user = user