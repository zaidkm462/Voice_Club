# Audition submission merge

Based on teammate commit `6c4a918`. No recording/upload endpoints or recording-page files were replaced.

## Changed application files

- `src/app/db.py`: submission verifies ownership, contestant role, PDF access and nonempty local audio; saves submitted/pending atomically. Repeating the same submission preserves its review decision. Other draft records are retained. A different already-submitted audition produces a conflict, not replacement.
- `src/app/recordings/routes.py`: keeps POST `/api/recordings/submit` and the `record_id` request field. Adds JSON validation, real HTTP error statuses and a confirmed success object. Upload and delete handlers are unchanged.
- `src/app/static/js/user_dash.js`: waits for confirmed submission before showing success, prevents duplicate in-flight requests, reloads saved data, displays account review decisions, and fixes an extra slash in the audio URL.

## Verification

With the project's Flask and Flask-Cors dependencies installed:

```text
python tests/audition_submission.py
node tests/audition_frontend.cjs
```

The Python test creates its own database and generated audio in a temporary directory. It does not open or modify the real database/uploads. It exercises the existing upload endpoint, submission, admin/owner details, authorized audio responses/range requests, rejected invalid requests, draft preservation and decision-preserving retries.

The JavaScript test exercises the dashboard functions with mocked requests. This is not a microphone/browser playback test. Manual verification remains: record/save/send as a contestant, then open their details and play the audio as admin and owner. Routes: `/user/record`, `/user/recordings`, `/admin/contestants`, `/owner/contestants`.

The existing one-submitted-audition rule is retained; a different recording cannot replace it automatically. Existing recording creation/upload/delete implementations and unrelated security limitations have not been audited or changed in this patch.

Do not replace the teammate's live database or media when transferring these code changes. Nothing has been committed or pushed by this update.
