import sqlite3

from  config import DATABASE


def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db

def generate_5_records():
    db = get_db()
    cur = db.cursor()
    for i in range(1, 6):
        cur.execute(f'INSERT INTO "main"."recordings" ("id", "user_id", "pdf_id", "path", "duration_seconds", "status", "created_at") VALUES ({i}, 3, 1, "/storage/recordings/freettsai-1790329814865.mp3", 146, "unsent", "2026-09-2{i} 10:50:49");')
        db.commit()

generate_5_records()