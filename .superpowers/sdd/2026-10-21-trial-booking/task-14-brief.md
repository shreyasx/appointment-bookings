### Task 14: README and final pass

**Files:**
- Create: `README.md`. Do not create or touch `TRANSCRIPT.md`; the author adds it after this plan.
- Delete: `docs/red-run.txt`, after its content is quoted in the README.

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Write `README.md`** with the sections listed in spec §15, in that order. The following wording is required, **verbatim**:
  - **Cap rule:** "at most 2 active trial classes per mentor per calendar day in the mentor's own time zone".
  - **Missing hour:** "Working hours that start inside the gap move forward by the skipped hour: 2:00 becomes 3:00, and 2:30 becomes 3:30."
  - **Ireland:** "code that reads a DST flag can get Ireland backwards, depending on which format of the data a library uses".
  - **The demo clock:**
    - `docker compose down -v`, then `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`;
    - it starts again from `DEMO_NOW` whenever the app restarts.
  - **The edge-case table and examples** from spec §7.
  - **The API reference**, with one curl example per endpoint and the error shape.
  - **Tests:** `docker compose run --rm --build test` (or `npm test` with `db` and `mailpit` up). The suite runs under `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`: Chatham is ahead of UTC and Los Angeles is behind it, like every US parent's browser.
  - **"How we know the race test bites"**: the failing output from `docs/red-run.txt`.
  - **Assumptions and trade-offs**: the spec's non-goals, the `ponytail:` notes, and Intl-only (with Temporal as the upgrade path).

- [ ] **Step 2: Final verification**

Run: `npm run typecheck && docker compose down -v && docker compose up --build -d --wait && docker compose run --rm --build test`
Expected: exit 0, and both test runs pass. Then click through `/`, a confirmation page and `/mentors` at `localhost:3000`, once without and once with `DEMO_NOW`.

- [ ] **Step 3: Commit**

```bash
git add README.md && git rm docs/red-run.txt
git commit -m "docs: add readme with dst and concurrency notes"
```
