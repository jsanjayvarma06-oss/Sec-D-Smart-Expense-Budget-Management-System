# Backup and Recovery Strategy

Smart Expense & Budget Management System. Covers NFR10 (Recoverability):
*financial records should survive an app or server failure*, with the pass
criterion *after a forced shutdown, all committed records are still present on
restart*. The SRS review comment asked for the backup frequency to be stated;
it is set out in section 3.

Values marked **proposed** still need team agreement, as do the other
placeholder thresholds.

## 1. What has to be protected

| Data | Why it matters | Where it lives |
|---|---|---|
| Income, expenses, budgets, savings goals, recurring expenses, categories | The user's financial history. It cannot be recreated if lost | PostgreSQL |
| Users and password hashes | Needed to log in. Hashes are sensitive even though passwords are never stored | PostgreSQL |
| Sessions | Short-lived; losing them only means users log in again | PostgreSQL |
| Code and migrations | Rebuild the schema from scratch | GitHub |

Everything that matters is in one PostgreSQL database, so protecting that
database protects the whole system. The API keeps no state of its own.

## 2. Two kinds of failure

| Failure | Example | What protects the data |
|---|---|---|
| **Crash**: the app or database stops suddenly | Server killed, power cut, out of memory | PostgreSQL's write-ahead log: a transaction is on disk before it is reported as committed, and replayed on restart. Uncommitted work is rolled back. Nothing to restore by hand. |
| **Loss**: the data itself is gone or wrong | Disk failure, dropped table, bad migration, ransomware | Backups taken on a schedule and kept somewhere else (section 3) |

### Crash safety in the design

- Every change to user data runs inside a single transaction (`withUser()`), so
  a crash part-way through a change saves none of it, never half of it.
- PostgreSQL must run with `fsync`, `synchronous_commit` and `full_page_writes`
  on, its defaults. A test fails if any of them is turned off.
- The API is stateless apart from what is in the database, so restarting it
  loses nothing. Sessions are stored in the database, so users stay logged in.

## 3. Backups

| Item | Local / demo | Production (**proposed**) |
|---|---|---|
| Type | Full logical backup (`pg_dump`, custom format) | Managed PostgreSQL with continuous WAL archiving (point-in-time recovery) plus a nightly `pg_dump` |
| Frequency | Before every migration or demo, and daily while data matters | Continuous WAL; nightly full backup at 02:00 |
| Retention | Newest 14 backups (`BACKUP_KEEP`) | 7 daily, 4 weekly, 3 monthly |
| Where stored | `backups/` (git-ignored, owner-only permissions) | Encrypted storage in a different region from the database |
| Recovery point objective (max data lost) | Up to 24 hours | 5 minutes |
| Recovery time objective (max downtime) | 15 minutes | 1 hour |

Backups contain financial data and password hashes, so they get the same
protection as the database:

- Never commit them to git. `backups/` is in `.gitignore`.
- Store them encrypted, with access limited to the repo owner (or the ops role
  in production).
- Never attach them to issues or chat. Use sample data for debugging (SR10).

### Taking a backup

```bash
npm run db:backup
```

The script writes `backups/smart_expense-<timestamp>.dump` and checks the file
can be read back before treating it as complete. An interrupted backup is left
as `.partial` and never counted. It then deletes all but the newest
`BACKUP_KEEP` backups.

### Restoring a backup

```bash
npm run db:restore -w backend -- backups/smart_expense-<timestamp>.dump --yes
```

- It restores into the database in `DATABASE_URL`, replacing what is there.
  Without `--yes` it only says what it would do.
- It runs as one transaction: if anything fails, the database is left exactly as
  it was.
- It creates the `app_user` role first if the server doesn't have it. The
  row-level security grants need that role, and it is not part of a database
  backup.
- Afterwards it prints row counts to compare with the source.

To restore without touching the live database (for example, to recover one
deleted record), create an empty database, point `DATABASE_URL` at it, restore
there, and copy back what is needed.

## 4. Testing recovery

A backup that has never been restored is only a hope. Recovery is checked in
three ways.

| Check | How | When |
|---|---|---|
| App crash (test plan ST_06) | `backend/test/recovery.test.js` kills the API with SIGKILL and restarts it, then checks records, totals and sessions are unchanged | Every `npm test` |
| No partial writes | Same file: a failure mid-change, and a database connection killed mid-transaction, leave no partial records | Every `npm test` |
| Database forced shutdown (NFR10) | `npm run db:crash-drill -w backend -- --yes` commits 100 expenses, leaves 10 uncommitted, power-cuts PostgreSQL, restarts it and checks exactly the committed ones came back | Before each release, on a local or staging server |
| Backup restore drill | Restore the latest backup into an empty database and compare row counts and totals | Monthly (**proposed**) and before each release |

The crash drill needs commands to stop and start the server, for example:

```bash
PG_CRASH_CMD='pg_ctl -D <data dir> stop -m immediate' \
PG_START_CMD='pg_ctl -D <data dir> -l <log file> start' \
npm run db:crash-drill -w backend -- --yes
```

With Docker, use `docker kill <container>` and `docker start <container>`. The
drill really stops the server, so never run it against production.

## 5. Results

Run on 22 October 2026 on PostgreSQL 17.11 (local).

| Check | Result |
|---|---|
| Automated recovery tests (4) | **Pass**: records (5 expenses, 5,000.00) and the session survived SIGKILL and restart; interrupted changes left nothing behind; durability settings on |
| Forced-shutdown drill | **Pass**: 100 committed expenses (total 5,050.00) present after an immediate stop; 0 of 10 uncommitted present. PostgreSQL logged "not properly shut down; automatic recovery in progress" and replayed the WAL in 0.05 s |
| Backup | **Pass**: 33.6 KB custom-format dump of 10 tables, owner-only permissions, verified readable |
| Restore drill | **Pass**: restored into an empty database and again over existing data. Row counts and the expense total (4,999.50) matched, with 10 row-level security policies, 7 tables with forced row-level security, and `app_user` grants intact |

## 6. Recovery procedures

**API crashed or was restarted.** Nothing to do. Start it again; committed data
and sessions are intact.

**Database crashed.** Start PostgreSQL. It replays the write-ahead log
automatically, and its log shows "automatic recovery in progress" followed by
"ready to accept connections". Then check `/api/health`.

**Data lost or corrupted.**

1. Stop the API so nothing writes to a database in a bad state.
2. Choose the newest backup from before the problem (production: choose a point
   in time).
3. Restore into an empty database first and check the row counts.
4. Restore into the live database (or switch `DATABASE_URL` to the checked
   copy), then run `npm run migrate` in case newer migrations exist.
5. Start the API, check `/api/health`, and record what happened and how much
   data, if any, was lost.

## 7. Open decisions

- Production hosting, which decides how point-in-time recovery is provided.
- The proposed retention, objectives and drill frequency in sections 3 and 4.
- Whether the database itself is encrypted at rest. This is also an open item in
  the Secure Architecture Design.
