# Voice Club

Flask voice-audition project with contestant, admin and owner dashboards.
Based on the team's [Voice_Club](https://github.com/zaidkm462/Voice_Club) commit `6c4a918`, with the audition-submission fix described in [AUDITION_FIX.md](AUDITION_FIX.md).

This is a clean source snapshot with fresh Git history. The real database, contestant media, local certificates/keys and environment secrets are intentionally excluded. The original legacy `src/tst` script is excluded because importing it writes into the configured database; use the isolated regression tests below instead.

## Local setup (PowerShell, Python 3.11+)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
New-Item -ItemType Directory -Force src/storage/pdfs, src/storage/recordings
cd src
```

For a new, empty local database only, run `python init_db.py` from `src`. Do not run it against an existing database: initialization is not a migration. Initialization does not create login accounts. Coordinate owner-account provisioning with the teammate; no shared default credentials are included.

For an existing installation, preserve its `src/competition.db` and uploaded files. Do not overwrite or publish them when merging code. Keep backups outside this repository.

Start the development server from `src`:

```powershell
python -m flask --app run run --host 127.0.0.1 --port 5000
```

Open http://127.0.0.1:5000/. Key pages: `/user/record`, `/user/recordings`, `/admin/contestants`, `/owner/contestants`.

## Tests (from repository root)

```powershell
python tests/audition_submission.py
node tests/audition_frontend.cjs
```

The Python test creates its own temporary database and media. The JavaScript test requires Node.js and mocks network requests; it does not verify browser microphone capture/playback. Manually test record/save/send and admin/owner playback before handing over a live deployment.

## Security and scope

This remains a development prototype, not production-ready hosting code. Existing authentication stores passwords/tokens without hashing, logs tokens, and has a placeholder secret. Authentication, CSRF, upload validation and deployment settings need a dedicated security pass. Keep development servers local; do not expose `run.py`'s debug server publicly.

No database, upload or private key should ever be committed. `.gitignore` helps prevent accidental additions but does not remove secrets from history. Previously shared real private keys should be replaced separately by their owner.
