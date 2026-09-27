from pathlib import Path, PurePosixPath

from flask import Blueprint, abort, g, send_from_directory

import app.db as db
import config


store_bp = Blueprint("storage", __name__)


@store_bp.route("/storage/<path:filename>")
def serve_storage_file(filename):
    if g.user is None:
        abort(401)

    # Accept canonical paths inside the two media directories only.
    relative_path = PurePosixPath(filename)

    if (
        "\\" in filename
        or relative_path.is_absolute()
        or ".." in relative_path.parts
        or str(relative_path) != filename
        or len(relative_path.parts) != 2
        or relative_path.parts[0] not in ("pdfs", "recordings")
    ):
        abort(404)

    storage_root = Path(config.STORAGE_DIR).resolve()
    file_path = (storage_root / filename).resolve()

    if not file_path.is_relative_to(storage_root):
        abort(404)

    stored_url = f"/storage/{filename}"
    legacy_stored_url = filename
    user_id = g.user["id"]
    is_admin = g.user["role"] in ("admin", "owner")
    connection = db.get_db()

    if relative_path.parts[0] == "pdfs":
        allowed = connection.execute(
            """
            SELECT 1
            FROM pdfs
            WHERE path IN (?, ?)
              AND (
                  owner_user_id IS NULL
                  OR owner_user_id = ?
                  OR ? = 1
              )
            LIMIT 1
            """,
            (stored_url, legacy_stored_url, user_id, int(is_admin)),
        ).fetchone()

    else:
        allowed = connection.execute(
            """
            SELECT 1
            FROM recordings
            WHERE path IN (?, ?)
              AND (
                  user_id = ?
                  OR (? = 1 AND submitted = 1)
              )
            LIMIT 1
            """,
            (stored_url, legacy_stored_url, user_id, int(is_admin)),
        ).fetchone()

    if allowed is None:
        abort(404)

    response = send_from_directory(
        str(storage_root),
        filename,
        conditional=True,
    )

    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"

    return response