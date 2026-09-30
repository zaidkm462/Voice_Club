# Password hashing contribution

Based on teammate commit `4068032`. The README, audition logic, database schema and media are unchanged.

- New contestant accounts store salted Werkzeug scrypt hashes, not readable passwords.
- Login verifies those hashes and rejects plaintext database values. Passwords must be typed exactly as before, including whitespace and Arabic characters.
- Invalid login request bodies produce HTTP 400 instead of server errors.
- Login no longer prints session tokens to the server log.
- Existing account passwords require the explicit migration below. The migration is not run automatically, does not reset passwords and includes owners/admins/contestants.

## Deployment order — coordinate before merging or reloading

1. Pause access to the app, including account creation. Do not reload the new login code against unmigrated plaintext accounts.
2. With the project's virtualenv activated, run from the repository root:

   ```bash
   python src/migrate_passwords.py --database /home/tryourvoice/Voice_Club/src/competition.db --backup /home/tryourvoice/voiceclub-before-password-hashing.sqlite
   ```

   The backup path must not already exist. It must stay private, outside Git and web-served directories. It contains the old readable passwords and session data; protect it and remove it securely when the migration has been verified and rollback is no longer needed. The script uses a SQLite backup, changes only `accounts.password_hash` in a transaction and skips recognized existing hashes. It does not alter submitted auditions, roles, usernames or media. Empty/malformed credentials need explicit repair instead of automatic guessing. Re-running with a new backup path does not double-hash passwords.

3. Deploy this branch and reload the web app. Test the existing owner/admin/contestant logins and create a disposable contestant account. Their original passwords should still work.
4. Do not roll back to the old plaintext-comparison code after migration without a coordinated database rollback. Do not commit or share the backup, real database, passwords or session tokens.

External scripts which directly insert accounts must use `app.passwords.hash_password` too. The old root-level `db.py` is not used by the app and has not been modified; do not use it to provision accounts.

## Testing

```bash
python tests/password_hashing.py
```

Uses a temporary SQLite database and disposable accounts only. No real database or media is opened or changed. Hashing is not a complete security audit: token storage/expiry, secure cookies, CSRF, login rate limiting and upload protections remain separate work. Previously exposed passwords should be rotated; hashing them now does not undo prior exposure.
