### Task 3: Database: schema, migrations, test databases

**Files:**
- Create: `docker-compose.yml`, `migrations/001_init.sql`, `src/server/db.ts`, `src/server/test-db.ts`, `src/server/db.test.ts`
- Modify: `package.json` (dependency `pg`; dev dependency `@types/pg`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/server/db.ts`:
    - `createPool(connectionString: string, max?: number): pg.Pool`. Attaches `pool.on('error', …)` logging that skips `err.code === '57P01'` (a test teardown's `drop database … with (force)` ends idle connections), and its module sets the `date` parser.
    - `migrate(pool: pg.Pool): Promise<string[]>`, which returns the file names it applied.
  - `src/server/test-db.ts`:
    - `type TestDb = { pool: pg.Pool; drop(): Promise<void> }`
    - `createTestDb(): Promise<TestDb>`
    - `insertMentor(pool: pg.Pool, m: { name?: string; timeZone: string; hours: { weekday: number; start: string; end: string }[] }): Promise<number>`

- [ ] **Step 1: Write `docker-compose.yml`** with two services for now:
  - `db`:
    - `postgres:17-alpine`, with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` all `bookings`, plus `TZ: UTC`;
    - ports `"5433:5432"`;
    - `command: ["postgres", "-c", "max_connections=200"]`, because test files run in parallel and each race test opens up to 40 connections;
    - healthcheck `pg_isready -U bookings -d bookings` (interval 2s, retries 30);
    - named volume `db-data` mounted at `/var/lib/postgresql/data`.
  - `mailpit`: `axllent/mailpit:v1.31.6` (its image has a `readyz` healthcheck, so `--wait` waits on it), `TZ: UTC`, ports `"8025:8025"` and `"1025:1025"`.

  Start them: `docker compose up -d db mailpit`.

- [ ] **Step 2: Write `migrations/001_init.sql`**, copying spec §11 verbatim: the three tables, the partial unique index `bookings_one_per_mentor_hour`, and the index `bookings_mentor_day`.

- [ ] **Step 3: Write the failing tests** in `src/server/db.test.ts`

```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from './db.ts';
import { createTestDb, insertMentor, type TestDb } from './test-db.ts';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.drop());

const insertBooking = (mentorId: number, startsAt: string, localDay: string) => db.pool.query(
  `insert into bookings (mentor_id, starts_at, mentor_local_date, parent_name, parent_email, child_name, parent_time_zone, class_link)
   values ($1, $2, $3, 'Asha Patel', 'asha@example.com', 'Rohan', 'Europe/London', 'https://classroom.example/trial/x')
   returning id, mentor_local_date`, [mentorId, startsAt, localDay]);

test('migrate is idempotent and creates the tables', async () => {
  expect(await migrate(db.pool)).toEqual([]);
  const { rows } = await db.pool.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  expect(rows.map((r) => r.table_name)).toEqual(['bookings', 'mentor_hours', 'mentors', 'schema_migrations']);
});

test('date columns come back as plain strings in any host time zone', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const { rows } = await insertBooking(mentorId, '2026-10-27T15:00:00Z', '2026-10-27');
  expect(rows[0].mentor_local_date).toBe('2026-10-27');
});

test('a mentor can have only one active booking per hour', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const first = await insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28');
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).rejects.toMatchObject({ code: '23505' });
  await db.pool.query('update bookings set cancelled_at = now() where id = $1', [first.rows[0].id]);
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).resolves.toBeTruthy();
});
```

- [ ] **Step 4: Run them and see them fail**

Run: `npx vitest run src/server/db.test.ts`
Expected: FAIL, failing to resolve `./db.ts`.

- [ ] **Step 5: Implement `src/server/db.ts` and `src/server/test-db.ts`**
  - **The `date` parser**: at module load in `db.ts`, call `pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)`. By default, `pg` turns a `date` into local midnight, and under `TZ=Pacific/Chatham` that shifts it a day.
  - **`migrate`**, on one client:
    1. Take `pg_advisory_lock(727001)`.
    2. `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`.
    3. Read `migrations/*.sql` sorted, resolved with `new URL('../../migrations/', import.meta.url)`.
    4. Run each unapplied file plus its `insert` into `schema_migrations` in its own transaction.
    5. Unlock in `finally`.
  - **`createTestDb`**:
    - Connect an admin pool to `process.env.DATABASE_URL ?? 'postgres://bookings:bookings@localhost:5433/bookings'`.
    - `create database "t_<12 random hex>"`.
    - `createPool(urlForThatDb, 40)` (40 connections for the race tests), then `migrate`.
    - `drop()` ends the pool, runs `drop database … with (force)`, then ends the admin pool.
  - **`insertMentor`** inserts:
    - the name (default `'Test Mentor'`);
    - a unique email `m-<random>@mentors.example`;
    - bio `'Test mentor'`, subjects `{Coding}`;
    - the hours rows.
    It returns the id.

- [ ] **Step 6: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times. Under `TZ=Pacific/Chatham`, the date test proves the parser works.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml migrations/001_init.sql src/server/db.ts src/server/test-db.ts src/server/db.test.ts package.json package-lock.json
git commit -m "feat(db): add schema, migration runner and per-file test databases"
```

---

