# Final fix wave: report

Commit: `f0e2b5a fix: say no slots for an empty day, harden the image and tidy focus after errors` (on `main`, lowercase, no trailer, 8 files added by name).

## Items

### 1. A day with no times must not read "Full" (I1): done
- `src/web/booking.ts`: added `export function dayStatus(day: Day): 'open' | 'full' | 'none'`. It returns 'none' when `day.slots.length === 0`, 'full' when `openCount === 0`, and 'open' otherwise.
- `src/web/BookingPage.tsx`, chip footer: `status === 'none' ? 'No slots' : status === 'full' ? 'Full' : '1 slot' / '{n} slots'`. The greyed styling still keys on `d.openCount`, so "Full" and "No slots" chips are both greyed.
- `EmptyDay` heading: "Every mentor is booked on {day}." when `dayStatus` is 'full'. Otherwise "No times are left today." when `dayKey === days[0].key`, and "There are no times on {day}." for any other day. Everything after the heading is unchanged.
- The SlotGrid/EmptyDay branch (`day.openCount > 0`) is unchanged. It already sends both 'full' and 'none' days to `EmptyDay`; only that heading was wrong.
- Test: `booking.test.ts` › "dayStatus tells an open day from a fully booked one and from one with no times at all". It covers all three values.
- Browser check (DEMO_NOW=2026-10-20T22:34:00Z, London): today's chip reads "Tue 20 Oct No slots", and tapping it shows "No times are left today." The 23 and 24 Oct chips still read "Full", and 23 Oct shows "Every mentor is booked on Fri 23 Oct." Screenshots: `.playwright-mcp/final-shots/today-no-slots.png` and `.playwright-mcp/final-shots/full-day-23-oct.png`.

### 2. `migrate` rollback guard: done
- `src/server/db.ts:40` now reads `await client.query('rollback').catch(() => {});`. This matches `bookings.ts` and `seed.ts`.
- Covered by typecheck and the full suite (the migration tests pass). There is no dedicated test; the review rules that out as hard to make deterministic.

### 3. `USER node` in the runtime stage: done
- Added `USER node` just before the final `CMD` in the `Dockerfile`.
- `docker compose up --build -d --wait`: all three services healthy. `docker compose logs app` shows `listening on http://localhost:3000`. `docker compose exec app id -un` prints `node`. `curl` returns 200 for `/` and for `/api/slots`.

### 4. Quiet healthcheck: done
- `docker-compose.yml`: the test is now `["CMD", "wget", "-qO", "/dev/null", "http://localhost:3000/api/slots"]`, and the interval stays at 2s.
- `docker inspect` health log: `[(0, '')]`. The exit code is 0 and the output is empty, so no slot JSON lands in the log.

### 5. 3:1 selected state (M1): done
- The selected day chip and selected slot now use `peer-checked:border-ink`. **Deviation, flagged:** I *replaced* `peer-checked:border-brand` with it rather than adding it beside it. Both classes set `border-color` under the same variant, so keeping both would leave a dead class, and which one won would depend on Tailwind's sort order. The fill (`bg-brand-100` / `bg-brand`) and the bold text are unchanged.
- Browser: the computed `borderColor` of the selected chip and the selected slot is `rgb(47, 79, 79)`, which is `--color-ink` (#2f4f4f). It is visible in both screenshots.

### 6. Focus after errors (M2): done
- **409:** the `onUnavailable` callback now wraps its two dispatches in `flushSync` and then focuses the alert through a ref. `UnavailableAlert` takes `ref` as a prop (React 19), and its box has `tabIndex={-1}`. No new effect was added.
  - Browser, real 409: I selected Wed 21 Oct 2:00 AM BST, filled that hour from `curl` (five 201s, then a 409), and pressed Enter on Confirm.
  - `document.activeElement` was the `DIV role="alert" tabIndex=-1` reading "Sorry, 2:00 AM BST on Wed 21 Oct is no longer available…". Tab then moved to the first alternative, "4:00 PM BST". Screenshot: `.playwright-mcp/final-shots/409-alert-focused.png`.
  - The only console entry was the browser's own "Failed to load resource: 409". There was no React warning.
- **400 bounce:** the existing focus-only step effect now focuses `document.querySelector('input[aria-invalid]') ?? heading`.
  - Browser: with a whitespace-only child's name, Confirm returned a real 400 and bounced to step 1. Focus landed on `INPUT name=childName aria-invalid=true`, and the field error read "Required".
  - A plain Back press still focuses the "Your details" `H2`.

### 7. bfcache (M3): done
- `src/web/main.tsx`: `addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });`, with a one-line comment saying why.
- Checked: typecheck, the build, and the listener is present in `dist/web/assets/*.js`.
- Not reproduced in a real Safari or Firefox. Chromium doesn't restore this page from the bfcache, so it can't exercise the path.

### 8. Email length (M4): done
- `Field` now puts `maxLength={80}` *before* `{...input}`, so a passed value wins, and `parentEmail` passes `maxLength={254}`.
- Browser: the `maxLength` values are `parentName 80`, `parentEmail 254`, `childName 80`.

### 9. Rejected time zone (M5): done
- The step-2 alert shows "Please pick your time zone from the list." when `fieldErrors(bookError).parentTimeZone` is set, and `bookError.message` otherwise. It stays on step 2, because `hasDetailErrors` only looks at the three detail fields.
- `curl` with `parentTimeZone: "Mars/Olympus_Mons"` returns the real body: `{"error":{"code":"VALIDATION_FAILED","message":"Some details need fixing.","fields":{"parentTimeZone":"Unknown time zone"}}}`.
- Browser: I routed `POST /api/bookings` to return that exact 400 body. This stands in for a zone that the browser's ICU knows but Node's doesn't, since the browser validates with the same `isValidTimeZone`. The alert read "Please pick your time zone from the list.", and "Pick a time" was still visible.
- If a 400 flags both a detail field and the zone, the existing bounce to step 1 still wins. The zone message would show on the next attempt.

### 10. `.gitignore` (M6): done
- Added `*.pdf`. `git status --short` no longer lists the assignment PDF, and the tree is clean after the commit.

## TDD evidence (item 1)

RED, `TZ=UTC npx vitest run src/web/booking.test.ts`, after adding the test and its import but before `dayStatus` existed:
```
 ❯ src/web/booking.test.ts (19 tests | 1 failed) 325ms
   × dayStatus tells an open day from a fully booked one and from one with no times at all 2ms
 FAIL  src/web/booking.test.ts > dayStatus tells an open day from a fully booked one and from one with no times at all
TypeError: dayStatus is not a function
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```
That failure was expected: the import resolved to `undefined` because the helper didn't exist yet.

GREEN, the same command after adding `dayStatus`:
```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

## Verification commands and output

- `npm run typecheck`: `tsc`, no errors.
- `npm run build`: `✓ 69 modules transformed … ✓ built in 106ms`.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles; db container up): `Test Files 8 passed (8) / Tests 109 passed (109)`, three times. Grepping a UTC run for `stderr|warn|error` found nothing.
- `docker compose up --build -d --wait`: app, db and mailpit are all `running healthy`, and the log shows `app-1 | listening on http://localhost:3000`.
- `docker compose exec app id -un`: `node`.
- `docker compose run --rm --build test`: `Test Files 8 passed (8) / Tests 109 passed (109)`, three times.
- `docker compose down -v` then `DEMO_NOW=2026-10-20T22:34:00Z docker compose up -d --wait`. London day counts (open/total): 20 Oct had no slots at all, 21 Oct 6/6, 22 Oct 6/8, 23 Oct 0/8, 24 Oct 0/9.
- Playwright checks: listed under items 1, 5, 6, 8 and 9 above. Three screenshots are in `.playwright-mcp/final-shots/` (not committed).
- Final reset: `docker compose down -v && docker compose up -d --wait`. All healthy, `/api/slots` reports `demo False`, and `id -un` prints `node`.

## Files changed
- `.gitignore`
- `Dockerfile`
- `docker-compose.yml`
- `src/server/db.ts`
- `src/web/BookingPage.tsx`
- `src/web/booking.ts`
- `src/web/booking.test.ts`
- `src/web/main.tsx`

## Self-review and concerns
- I added no new `useEffect`, `useMemo` or `useCallback`, and no raw hex values. `ink` is an existing `@theme` token.
- The 409 focus uses `flushSync` inside TanStack's `onError`, which runs in a promise callback outside React rendering, so React gives no warning. That was confirmed in the browser console.
- The 400 focus uses a document-level `input[aria-invalid]` query. Only the step-1 inputs ever carry that attribute.
- **Concern (minor):** item 5 replaces `peer-checked:border-brand` instead of adding `peer-checked:border-ink` next to it. The reasoning is above. If you want the literal addition, it's a one-word revert.
- **Concern (minor):** item 7 is untested in Safari and Firefox, because Chromium can't exercise that bfcache path.
- To make the real 409, the demo database got five filler bookings from `curl`. That database was then destroyed with `down -v`.
- No background shells were started.
