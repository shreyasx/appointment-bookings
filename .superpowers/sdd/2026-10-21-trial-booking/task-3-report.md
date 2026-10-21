# Task 3 report: database, schema, migrations, test databases

Status: DONE. Commit `4e4d7f1 feat(db): add schema, migration runner and per-file test databases` (no attribution trailer, per the rules file).

## What I implemented

- `docker-compose.yml`: `db` (`postgres:17-alpine`, user/password/db all `bookings`, `TZ: UTC`, port `5433:5432`, `max_connections=200`, `pg_isready` healthcheck at 2s x 30, named volume `db-data`) and `mailpit` (`axllent/mailpit:v1.31.6`, `TZ: UTC`, ports 8025 and 1025). Started with `docker compose up -d --wait db mailpit`; both report healthy and are still running.
- `migrations/001_init.sql`: spec section 11 copied verbatim (three tables, `bookings_one_per_mentor_hour`, `bookings_mentor_day`).
- `src/server/db.ts`:
  - module-load `pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)`;
  - `createPool(connectionString, max?)` with an error listener that logs via `console.error` and skips `err.code === '57P01'`;
  - `migrate(pool)`: one client, `pg_advisory_lock(727001)`, `create table if not exists schema_migrations`, `migrations/*.sql` sorted and resolved from `new URL('../../migrations/', import.meta.url)`, each unapplied file plus its `schema_migrations` insert in its own transaction (rollback on error), unlock in `finally`, then release. Returns the applied file names.
- `src/server/test-db.ts`: `TestDb`, `createTestDb()` (admin pool via `createPool(url, 1)` on `DATABASE_URL` or the compose default, `create database "t_<12 hex>"`, `createPool(that url, 40)`, `migrate`; `drop()` = end pool, `drop database ... with (force)`, end admin pool) and `insertMentor` (default name `Test Mentor`, unique `m-<12 hex>@mentors.example`, bio `Test mentor`, subjects `{Coding}`, hours rows, returns id).
- `src/server/db.test.ts`: the brief's three tests, verbatim.
- `package.json` / `package-lock.json`: dependency `pg@^8.23.1`, dev dependency `@types/pg@^8.23.1`.

## Tests run

### RED (before `db.ts` and `test-db.ts` existed)

Command: `npx vitest run src/server/db.test.ts`

```
 FAIL  src/server/db.test.ts [ src/server/db.test.ts ]
Error: Cannot find module './db.ts' imported from .../src/server/db.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

Expected: the modules under test did not exist yet, which is the failure the brief predicts.

### GREEN

Command: `npx vitest run src/server/db.test.ts`

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### Mutation check on the `date` parser

I commented out the `setTypeParser` line and ran `TZ=Pacific/Chatham npx vitest run src/server/db.test.ts`. The date test failed (`expect(rows[0].mentor_local_date).toBe('2026-10-27')` got a `Date` instead). I restored the line, and `git diff` showed only the intended changes. So the test does prove the parser in the east-of-UTC host zone.

### Full suite

Command: `npm test` (UTC, Pacific/Chatham, America/Los_Angeles), run once before committing.

```
 Test Files  2 passed (2)
      Tests  49 passed (49)     (x3, one per host zone)
```

Output was pristine: no stack traces, no warnings. After the run `pg_database` held no leftover `t_%` databases, so teardown drops them cleanly. `npm run typecheck` (tsc) passes with no output.

## Files changed

`docker-compose.yml`, `migrations/001_init.sql`, `src/server/db.ts`, `src/server/test-db.ts`, `src/server/db.test.ts`, `package.json`, `package-lock.json`.

## Self-review

- Names and signatures match the brief exactly: `createPool`, `migrate`, `TestDb`, `createTestDb`, `insertMentor`.
- Small additions beyond the brief, kept deliberately:
  - `createTestDb` calls `drop()` and rethrows if `migrate` fails, so a bad migration doesn't leave databases behind on every run.
  - The admin pool also goes through `createPool`, so it gets the same error listener.
  - `migrate` rolls back and rethrows on a failed file.
- `insertMentor` inserts hours with one query per row. That is simple and the counts are tiny; it is not wrapped in a transaction, which only matters if an hours insert fails, and that fails the test anyway.
- `import pg from 'pg'` (default import) works under vitest, `tsc` and Node's native ESM.
- The database name is interpolated into SQL, but it is generated here (`t_` plus hex), never user input.
- Docker output is not secret-bearing; the only credentials in the diff are the repo's `bookings`/`bookings`.

## Concerns

None. `db` and `mailpit` are left running and healthy, as requested. The untracked assignment PDF in the repo root was not touched or committed.
