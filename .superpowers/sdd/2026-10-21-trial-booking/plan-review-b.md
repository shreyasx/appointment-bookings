# Plan review B: can each task be executed as written?

Plan: `docs/superpowers/plans/2026-10-21-trial-booking.md`. The line numbers refer to the current 1615-line version; the file was edited while this review ran, which changed the trailer and branch lines. Spec: `docs/superpowers/specs/2026-10-20-trial-booking-design.md`.

Method: I built Tasks 1–9 and 13 in a throwaway project, in plan order, with the plan's exact incremental `npm i` calls, its tsconfig and vite config, and its test code pasted verbatim. I then ran everything locally and in Docker. All containers, volumes and built images are removed.

Counts: **Critical 0 · Important 3 · Minor 7**

---

## Critical

None.

---

## Important

### I1. `npm run typecheck` fails from Task 10 onwards: TypeScript 7 checks side-effect imports

- **Where:** line 138 (Task 1 tsconfig `"types": ["node"]`), lines 1281–1283 (Task 10 Modify list), line 1343 (Task 10 Step 3), line 1359 (Task 10 `git add`). The same check also runs in Task 11 Step 2, Task 12 Step 4 and Task 14 Step 2.
- **What's wrong:**
  - The unpinned `typescript` dev dependency installs **7.0.2** today.
  - TS 7 turns `noUncheckedSideEffectImports` on by default.
  - `main.tsx`'s `import './index.css'` has no declaration, because `types` holds only `node`.
- **Failure (reproduced with the plan's tsconfig verbatim):**
  ```
  src/web/main.tsx(5,8): error TS2882: Cannot find module or type declarations for side-effect import of './index.css'.
  ```
  `tsc` exits 1, so the Task 10 Step 3 expectation ("exit 0") fails.
  - An implementer who fixes `tsconfig.json` still loses the fix, because Task 10's `git add` line doesn't include `tsconfig.json`.
  - Adding `vite/client` to `types` makes `tsc` exit 0 with no output.
- **Fix:** add to Task 10's **Modify** list:
  > `tsconfig.json`: `"types": ["node", "vite/client"]`. TypeScript 7 checks side-effect imports, so `import './index.css'` needs Vite's client types.

  Then add `tsconfig.json` to Task 10's `git add` command.

### I2. `docker compose run --rm test` silently reuses a stale test image

- **Where:** line 1509 (Task 13 Produces), line 1567 (Task 13 Step 4), line 1607 (Task 14 Step 2).
- **What's wrong:**
  - `docker compose up --build` only builds services in active profiles, so the `test` service (profile `test`) is never rebuilt.
  - `run` only builds an image when none exists.
- **Evidence (Compose v5.5.1):**
  1. I appended a line to `slots.test.ts` and ran `up --build -d --wait`.
  2. `reviewb-app` got a new image ID, while `reviewb-test` kept its old ID (`4e04712a3b4d`).
  3. `run --rm test` still showed the old file contents.
  4. `run --rm --build test` showed the new contents.
- **Failure:** every run after the first tests old code, and still exits 0. That covers:
  - a fix made during Task 13's review loop;
  - Task 14's "final verification";
  - a reviewer who pulls new commits and re-runs the tests.
- **Fix:** replace `docker compose run --rm test` with `docker compose run --rm --build test` at lines 1509, 1567 and 1607. Use the same command in the README's tests section.

### I3. The API tests can't catch a handler that ignores the app clock (spec §12 demo-clock test)

- **Where:** lines 911–916 (`lists slots from the app clock`) and lines 940–944 (`the demo flag reaches both list endpoints`).
- **What's wrong:**
  - The test clock is `2026-10-20T12:00Z`, one day behind the real clock today.
  - Every assertion is a lower bound (`slots[0].startsAt >= …14:00Z`) or concerns bookings on 27–30 Oct, which are still upcoming in real time too.
  - The demo test uses the same `NOW` as the normal clock and only checks `demo: true`.
  - Spec §12 requires that "both the slots and the mentors' upcoming bookings are computed from the demo `now`". Nothing tests that.
- **Evidence:**
  - I changed the slots and mentors handlers to filter with `new Date()` while still returning `now: clock.now()`.
  - **All 12 Task 7 tests still passed.**
- **Fix:** replace the test at lines 940–944 with the one below. It passed against a correct `app.ts` and failed against the real-clock mutation.

  ```ts
  test('the demo clock drives both list endpoints', async () => {
    const later = '2026-10-28T16:00:00.000Z';
    const demo = createApp({ pool, clock: { now: () => new Date(later), demo: true }, mailer, appUrl: '' });
    const slots = (await request(demo).get('/api/slots')).body;
    expect([slots.now, slots.demo, slots.slots[0].startsAt]).toEqual([later, true, '2026-10-29T15:00:00.000Z']);
    const mentors = (await request(demo).get('/api/mentors')).body;
    expect(mentors.demo).toBe(true);
    const times = mentors.mentors.flatMap((m: MentorDto) => m.bookings.map((b) => b.startsAt));
    expect(times.length).toBeGreaterThan(0);
    expect(times.every((t: string) => t >= later)).toBe(true);
  });
  ```

  Optionally, tighten line 914 to `expect(res.body.slots[0].startsAt).toBe('2026-10-20T15:00:00.000Z')`.

---

## Minor

### M1. The plan text uses TanStack Query v4 call forms; v5 has only the object form

- **Where:**
  - line 1472: `useQuery(['mentors'], getMentors)`;
  - line 1329: `useQuery(['booking', id])`;
  - line 1300: "invalidates `['slots']`".
- **Failure:** `@tanstack/react-query` 5.104.5 rejects the positional form with `TS2769 … Property 'queryKey' is missing` (verified). Typecheck catches it, but the plan steers the implementer wrong.
- **Fix:** write the v5 forms:
  - `useQuery({ queryKey: ['mentors'], queryFn: getMentors })`;
  - `useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) })`;
  - `queryClient.invalidateQueries({ queryKey: ['slots'] })`.

### M2. The double-click guard (Review Focus 1) has a gap after success

- **Where:** line 1400, checked at line 1422.
- **What's wrong:**
  - In v5, the hook-level `onSuccess` (which calls `location.assign`) runs before the mutation becomes `success`.
  - `isPending` then turns false, and the button re-enables while the browser is still loading `/bookings/:id`.
  - A second click in that window POSTs again, and the server books a second mentor.
- **Effect:** the manual check can pass by timing.
- **Fix:** "Disabled while `book.isPending || book.isSuccess` (success always navigates away)".

### M3. Some steps rely on text an isolated implementer never sees

- **Where and what's missing:**
  - line 860: "Two mentors with `ukHours`". `ukHours` is defined only in Task 5's text.
  - line 1107: "using `valid` from Task 7".
  - line 1348: "Create a booking with curl (as in Task 8)".
  - line 1489: "the same setup as Task 11".
  - lines 1352, 1378, 1490: "mockup 6", "mockups 1–5", "mockup 7B". No mockup is in the repo; the only image is the uncommitted `.playwright-mcp/mockup-check.png`.
- **Fix:** inline each one:
  - line 860: "`ukHours` = weekdays 1–5, `'20:30'`–`'23:30'`".
  - lines 1107 and 1348: `curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' -d '{"startsAt":"<first available startsAt from /api/slots>","parentName":"Asha Patel","parentEmail":"asha@example.com","childName":"Rohan","parentTimeZone":"Europe/London"}'`.
  - line 1489: copy Task 11's setup line.
  - lines 1352, 1378, 1490: replace "mockup N" with "spec §10". Alternatively, commit the mockups under `docs/` and cite their paths.

### M4. Three "Expected: FAIL" messages differ from what Vitest 5 prints

- **Where:** lines 301, 711 and 1468.
- **What Vitest 5 actually does:**
  - A missing named export doesn't fail the import. The new tests fail with `TypeError: formatWhen is not a function` (line 301) or `TypeError: mentorDays is not a function` (line 1468), while the old tests pass.
  - The red run prints `AssertionError: expected [ …(2) ] to have a length of 1 but got 2`. That reproduced 3 out of 3 times with `FOR UPDATE` removed, and the random-burst test failed too.
- **Fix:** use those strings in the plan.

### M5. The Mailpit tag is left for the implementer to look up

- **Where:** line 358.
- **Fix:** write `axllent/mailpit:v1.31.6`. That is the current v1 tag: it pulled and ran, and its image has a built-in `readyz` healthcheck, so `--wait` waits on it.

### M6. The Docker test run prints pool errors that look like failures

- **Where:** line 418.
- **What's wrong:**
  - `pool.end()` resolves before the idle sockets close.
  - `drop database … with (force)` then kills them.
  - `createPool`'s listener prints `pg pool error error: terminating connection due to administrator command` with a full stack.
- **Evidence:** this appeared 6 times in the Docker run, which still exited 0. It appeared 0 times locally.
- **Fix:** have `createPool`'s error listener skip `err.code === '57P01'`, or note in Task 3 that this line is expected noise.

### M7. Small over-builds (optional cuts)

- `PGTZ: UTC` on the `db` service does nothing. `PGTZ` is a libpq *client* variable, and `TZ` already covers the server.
- `max_connections=200` isn't needed. Only `bookings.test.ts` opens many connections (at most 40 plus admin), its tests run sequentially, and the peak including the app's pool stays near 60, under the default 100.
- `src/web/api.ts` and `src/web/ui.tsx` are two files beyond the spec's layout, which says to keep files few. They could live in `hooks.ts` and `App.tsx`.

---

## Verified working (no change needed)

- **Node:**
  - Local Node is v22.23.1. Type stripping is on by default: `node src/server/main.ts` and `node --watch …` both ran with no flags and no warning.
  - `node:24-alpine` is v24.22.0 and runs `main.ts` the same way, so the `tsc` fallback isn't needed.
  - Busybox `wget` is at `/usr/bin/wget`.
  - `TZ=Pacific/Chatham` works with no tzdata installed, through ICU's own data (offsets −765/−825).
- **Versions today:** typescript 7.0.2, vitest 5.0.5, vite 8.3.4 (deduped across vitest, plugin-react 6.1.2 and @tailwindcss/vite 4.3.3), tailwindcss 4.3.3, express 5.3.0, body-parser 2.3.0, zod 4.6.7, pg 8.23.1, nodemailer 10.1.7, supertest 7.3.1, @tanstack/react-query 5.104.5.
- **Lockfile:** the one generated on macOS lists linux-arm64-musl and linux-x64-musl bindings for rolldown, lightningcss and tailwind oxide. `npm ci` and `vite build` succeed in the image.
- **Tests:**
  - All verbatim test code from Tasks 1–9 passes under both `TZ` runs (94 tests), against straightforward implementations.
  - `tsc` on TS 7 is clean through Task 9.
- **Intl:**
  - Node 22 and 24 both resolve `Asia/Kolkata` to `Asia/Calcutta` in `resolvedOptions()`.
  - `supportedValuesOf` lacks `Asia/Kolkata` and `UTC`, as the spec says.
  - The six-locale rule gives exactly the Task 2 strings, and Tokyo is `GMT+9` in all six locales.
- **Libraries:**
  - Zod 4 behaves as the Task 7 tests expect: `z.iso.datetime({ offset: true })`, `z.email().max(254)`, `z.uuid()`, `.trim().min(1)` and the `\p{Cc}` regex.
  - Body-parser still sets `entity.parse.failed`.
  - Express 5's `/{*splat}` serves `index.html` for `/bookings/<uuid>`.
  - supertest works with Express 5.
  - `pg.types.builtins.DATE` typechecks and works as the date parser.
  - nodemailer delivers to Mailpit, and both subjects show up.
  - Tailwind v4 `@theme` tokens generate `rounded-card`, `bg-brand` and so on.
- **Docker:**
  - `down -v && up --build -d --wait` was healthy in about 15 s, and the log reads `listening on http://localhost:3000`.
  - `/` contains `id="root"`.
  - `run --rm test` passes both runs.
  - With `DEMO_NOW`, the slots endpoint returns `{"now":"2026-10-20T12:00:0…","demo":true`.
  - In 5 fresh `down -v`/`up --wait` cycles, the `pg_isready` init race never occurred: the temporary server lives about 250 ms, and the first probe comes at 2 s.
- **Review Focus:** each of the 5 items has a test or check in its owning task, and the tests pass. Item 1's check has the gap described in M2.
