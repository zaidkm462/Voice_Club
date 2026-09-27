from pathlib import Path, PurePosixPath

import app.db as db
import config


def remove_unreferenced_media(stored_url):
    if not isinstance(stored_url, str):
        return "failed"

    if not stored_url.startswith("/storage/"):
        return "failed"

    relative_name = stored_url.removeprefix("/storage/")
    relative_path = PurePosixPath(relative_name)

    if (
        "\\" in relative_name
        or ":" in relative_name
        or relative_path.is_absolute()
        or ".." in relative_path.parts
        or str(relative_path) != relative_name
        or len(relative_path.parts) != 2
        or relative_path.parts[0] not in ("pdfs", "recordings")
    ):
        return "failed"

    try:
        storage_root = Path(config.STORAGE_DIR).resolve()
        file_path = storage_root / relative_name

        if file_path.is_symlink() or file_path.parent.is_symlink():
            return "failed"

        if not file_path.resolve().is_relative_to(storage_root):
            return "failed"

        connection = db.get_db()

        with connection:
            connection.execute("BEGIN IMMEDIATE")

            reference = connection.execute(
                """
                SELECT 1 FROM pdfs WHERE path = ?
                UNION ALL
                SELECT 1 FROM recordings WHERE path = ?
                LIMIT 1
                """,
                (stored_url, stored_url),
            ).fetchone()

            if reference is not None:
                return "retained"

            try:
                file_path.unlink()
            except FileNotFoundError:
                return "missing"

        return "removed"

    except OSError:
        return "failed"