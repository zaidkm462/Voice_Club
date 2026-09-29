"""Run with python tests/audition_submission.py; only temporary data is used."""
import io
import sqlite3
import sys
import tempfile
import wave
from contextlib import contextmanager
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


@contextmanager
def connect(path):
    connection = sqlite3.connect(path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def main():
    with tempfile.TemporaryDirectory(prefix="voice-submission-") as temporary:
        import config
        import init_db

        root = Path(temporary)
        config.DATABASE = str(root / "test.db")
        config.STORAGE_DIR = str(root / "storage")
        config.RECORDING_DIR = str(root / "storage" / "recordings")
        config.PDF_DIR = str(root / "storage" / "pdfs")
        Path(config.RECORDING_DIR).mkdir(parents=True)
        Path(config.PDF_DIR).mkdir()
        init_db.DB_PATH = Path(config.DATABASE)
        init_db.init_database()
        from app import create_app
        from flask import g

        app = create_app()
        app.testing = True

        @app.teardown_appcontext
        def close_connection(error):
            connection = g.pop("db", None)
            if connection is not None:
                connection.close()

        with connect(config.DATABASE) as connection:
            for uid, role in ((1, "owner"), (2, "admin"), (3, "user"), (4, "user")):
                connection.execute(
                    "INSERT INTO accounts(id,full_name,username,password_hash,role,status) VALUES(?,?,?,?,?,?)",
                    (uid, "Test", f"test{uid}", "test-only", role, "unsent"),
                )
                connection.execute("INSERT INTO auth_tokens(token_hash,account_id) VALUES(?,?)", (f"test{uid}", uid))
            connection.execute("INSERT INTO pdfs(id,name,original_filename,path) VALUES(1,'Test','test.pdf','/storage/pdfs/test.pdf')")
            connection.execute("INSERT INTO pdfs(id,name,original_filename,path,owner_user_id) VALUES(2,'Private','private.pdf','/storage/pdfs/private.pdf',4)")

        client = app.test_client()
        endpoint = "/api/recordings/submit"

        def headers(uid):
            return {"Authorization": f"Bearer test{uid}"}

        def submit(record_id, uid=3):
            return client.post(endpoint, json={"record_id": record_id}, headers=headers(uid))

        # Exercise the unchanged upload endpoint using generated audio.
        stream = io.BytesIO()
        with wave.open(stream, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(8000)
            audio.writeframes(b"\x00\x00" * 800)
        stream.seek(0)
        upload = client.post("/api/recordings/upload", headers=headers(3), data={
            "pdf_id": "1", "duration": "1", "file": (stream, "audition.wav")
        })
        assert upload.status_code == 201, upload.get_json()
        recording_id = upload.get_json()["recording_id"]
        with connect(config.DATABASE) as connection:
            audio_path = connection.execute("SELECT path FROM recordings WHERE id=?", (recording_id,)).fetchone()[0]
            for rid, pdf, path in ((100, 1, audio_path), (101, 1, "/storage/recordings/missing.wav"),
                                   (102, 2, audio_path), (103, 1, "/storage/recordings/../test.db")):
                connection.execute("INSERT INTO recordings(id,user_id,pdf_id,path) VALUES(?,3,?,?)", (rid, pdf, path))

        assert client.get("/user/record", headers=headers(3)).status_code == 200
        assert client.post(endpoint, json={"record_id": recording_id}).status_code == 401
        assert submit(recording_id, 2).status_code == 403
        assert submit(recording_id, 1).status_code == 403
        assert submit(recording_id, 4).status_code == 404
        assert submit(99999).status_code == 404
        for invalid in (True, 0, -1, "1", None, [], {}):
            assert submit(invalid).status_code == 400
        assert client.post(endpoint, data="x", headers=headers(3)).status_code == 415
        assert client.post(endpoint, data="{", content_type="application/json", headers=headers(3)).status_code == 400
        assert submit(101).status_code == 409
        assert submit(102).status_code == 404
        assert submit(103).status_code == 409
        assert client.get(audio_path, headers=headers(2)).status_code == 404
        assert submit(recording_id).get_json() == {"ok": True, "recording_id": recording_id, "submitted": True}
        assert submit(100).status_code == 409
        for uid in (1, 2):
            response = client.get("/api/admin/users/3", headers=headers(uid))
            assert response.status_code == 200
            detail = response.get_json()
            assert detail["user"]["status"] == "pending"
            assert detail["submitted_recording"]["recording_id"] == recording_id
            assert client.get(audio_path, headers=headers(uid)).status_code == 200
            assert client.get(audio_path, headers={**headers(uid), "Range": "bytes=0-9"}).status_code == 206
        assert client.get(audio_path, headers=headers(4)).status_code == 404
        for status in ("approved", "rejected"):
            with connect(config.DATABASE) as connection:
                connection.execute("UPDATE accounts SET status=? WHERE id=3", (status,))
            assert submit(recording_id).status_code == 200
            with connect(config.DATABASE) as connection:
                assert connection.execute("SELECT status FROM accounts WHERE id=3").fetchone()[0] == status
                assert connection.execute("SELECT COUNT(*) FROM recordings WHERE user_id=3").fetchone()[0] == 5
        print("PASS: upload, submission, persistence, admin/owner visibility, media access, validation, draft preservation and safe retries")


if __name__ == "__main__":
    main()
