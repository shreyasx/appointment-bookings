# Task 13 report: Docker image and the full stack

**Status:** DONE
**Commit:** `f5f2314 feat(docker): one compose up migrates, seeds and serves; add test service` (no attribution trailer; lowercase)

## What I implemented

- `Dockerfile`: the brief's four stages verbatim (`deps`, `build`, `test`, `runtime`). The runtime stage is `node:24-alpine`, `NODE_ENV=production`, `TZ=UTC`, and runs `node src/server/main.ts`.
- `.dockerignore`: `node_modules`, `dist`, `.git`, `.playwright-mcp`, `.superpowers`, `docs`, `*.pdf`.
- `docker-compose.yml`:
  - added the `app` service (runtime target, the brief's environment, `depends_on` db healthy and mailpit started, a `wget` healthcheck on `/api/slots`);
  - added the `test` service (test target, `profiles: [test]`, same `DATABASE_URL`, `TZ: UTC`, `depends_on` db healthy);
  - applied the controller rulings:
    - every published port is bound to `127.0.0.1` (db `5433`, mailpit `8025` and `1025`, app `3000`), with a one-line YAML comment saying why;
    - `init: true` on `app`, with a comment explaining the PID 1 and SIGTERM reason.
- The Type-stripping fallback (a `tsc` build stage) was not needed: Node 24 in the image runs the `.ts` files directly and the log is clean.

## Verification

### Step 2: stack from scratch

`docker compose down -v && docker compose up --build -d --wait && docker compose logs app`

```
 Container appointment-bookings-app-1 Healthy
app-1  | listening on http://localhost:3000
```

The app log is that one line only: no warnings, no TypeScript errors. `docker compose ps` shows the published ports as `127.0.0.1:3000->3000`, `127.0.0.1:5433->5432`, `127.0.0.1:8025` and `127.0.0.1:1025`; `lsof` shows the four host listeners on 127.0.0.1 only.

### Step 3: smoke test

- `curl -s localhost:3000/api/slots | head -c 120` returned `{"now":"2026-10-20T22:00:08.570Z","demo":false,"slots":[{"startsAt":"2026-10-21T01:00:00.000Z","available":true},{"start`.
- `curl -s localhost:3000/ | grep -c 'id="root"'` returned `1`.
- Booking, via curl as briefed: `POST /api/bookings` with an available `startsAt` taken from `/api/slots` (`2026-10-21T22:00:00.000Z`, parent zone `America/New_York`) returned `201 Created` with mentor Sneha Kulkarni (`Asia/Kolkata`).
- Mailpit (`curl -s localhost:8025/api/v1/messages`) showed both emails, `total: 2`:
  - `New trial class: Thu 22 Oct, 3:30 AM IST (Kolkata)` to the mentor;
  - `Smoke Child's free trial class: Wed 21 Oct, 6:00 PM EDT (New York)` to the parent.
- Playwright was allowed. `localhost:3000` loaded the SPA (title "Free trial class | Codeyoung", the header, the "Book a FREE class for your child" heading, step 1 of 3). I did not drive the form; the booking went through the API as the controller asked. The browser is closed.

### Step 4: suite in Docker

`docker compose run --rm --build test`: exit 0, three passes (UTC, Pacific/Chatham, America/Los_Angeles), each `Test Files 8 passed (8)`, `Tests 108 passed (108)`. Output is clean (no warnings).

Time taken: 10.1 s for the first run (the test stage built, `deps` layer cached from the runtime build); 5.4 s for a repeat run with everything cached. Vitest itself takes about 1.0 to 1.3 s per zone.

Host check after the port rebind: `TZ=UTC npx vitest run src/server/bookings.test.ts` passes (8 tests) against `127.0.0.1:5433`, so host-run tests still reach the db.

### Step 5: demo clock

`docker compose down -v && DEMO_NOW=2026-10-20T12:00:00Z docker compose up -d --wait && curl -s localhost:3000/api/slots | head -c 60`

```
{"now":"2026-10-20T12:00:02.410Z","demo":true,"slots":[{"sta
```

App log: `listening on http://localhost:3000 (demo clock from 2026-10-20T12:00:00Z)`.

`init: true` check: `docker compose down -v` took 0.8 s for the whole stack, so the app handles SIGTERM instead of waiting out the 10 s kill timeout.

## Image sizes (`docker images`)

| Image | Size |
|---|---|
| `appointment-bookings-app` (runtime) | 267 MB |
| `appointment-bookings-test` | 564 MB |
| `node:24-alpine` | 238 MB |
| `postgres:17-alpine` | 415 MB |
| `axllent/mailpit:v1.31.6` | 58.4 MB |

The runtime image adds only about 29 MB over the base (prod dependencies, migrations, server and shared source, `dist/web`). The test image carries the dev dependencies (Vite, Vitest, TypeScript, Tailwind, React).

## Final state

The stack is left running under the demo clock (`DEMO_NOW=2026-10-20T12:00:00Z`): `app`, `db` and `mailpit` all healthy. The local demo database and Mailpit were reset by the `down -v` in Step 2 and again in Step 5, as expected. No non-Docker server was started, and I killed no processes.

## Files changed

- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/Dockerfile` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/.dockerignore` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/docker-compose.yml` (`app` and `test` added; ports rebound to 127.0.0.1)

The assignment PDF is still untracked and was not committed.

## TDD evidence

There is no unit-test RED/GREEN for infrastructure files. The equivalent checks are:

- RED: before the files existed, `docker compose run --rm --build test` could not run, because the `test` service was not defined.
- GREEN: the Step 2 to Step 5 outputs above.

## Self-review

- Brief values are used verbatim (stage names, env, healthcheck, depends_on, profile). The only additions are the three controller rulings.
- `DEMO_NOW: ${DEMO_NOW:-}` passes an empty string when unset. `createClock` treats a falsy value as "no demo", so `demo:false` is correct, as the Step 3 output shows.
- The wget healthcheck uses `localhost`. Express binds dual-stack, so it works on Alpine, and the container reached Healthy.

## Concerns

None blocking.

- The `test` service shares the dev `db` database server (not a separate one). The tests create and drop throwaway databases, so the demo data is untouched, but a concurrent `docker compose run test` and manual use of the db share its `max_connections=200`.
- The bind rule is loopback only. If the author wants to demo the app from another machine on the LAN, the `127.0.0.1:` prefix on the app port has to be dropped.
