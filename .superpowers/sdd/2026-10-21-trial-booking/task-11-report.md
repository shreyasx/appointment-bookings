# Task 11 report: booking page

Status: DONE_WITH_CONCERNS (the concerns are small; see the end).
Commit: `6d11f0a feat(web): add the booking page with zone pill, day chips, full and 409 states` (2 files, no trailer).

## What was implemented

`src/web/BookingPage.tsx` (new) and `src/web/App.tsx` (`/` now renders `BookingPage`; `/bookings/:id` and the not-found card are unchanged).

- **State**: `useReducer(flowReducer, initialFlow)`. `days`, `key = shownDayKey(...)`, the shown day, `selected`, `clockChange`, the alternatives and `busy` are all computed in render. Nothing is mirrored into state or effects.
- **Selected time outside the 14 days** (ruling): `selected = shownSlots.some(s => s.startsAt === state.selected) ? state.selected : null`. When it is null, Confirm reads "Choose a time" and is disabled.
- **Step 1**: three `Field`s, each with a `useId` label/input pair. All are `required` with `maxLength={80}`; the email is `type="email"`. The form is uncontrolled: `defaultValue` comes from `state.details`, and on submit `FormData` values are trimmed and dispatched as `detailsSubmitted`. Submitting also calls `book.reset()`, which clears stale field errors.
- **400 with fields** (ruling): the per-call `mutate` `onError` dispatches `back` when the 400's `fields` names a step 1 field. Step 1 then shows each message under its field, with `aria-invalid` and `aria-describedby`. The details stay as entered. Any other non-409 error shows `error.message` in a `role="alert"` line above Confirm.
- **Zone pill**: the visible pill shows a globe, `cityName(timeZone)` and a chevron. Over it sits a native `<select aria-label="Time zone">` with `absolute inset-0 opacity-0`. It has optgroups "Common" and "All time zones" built from `zoneOptions(timeZone, now)` with `filter`, so the shared array is never mutated. Because the select is invisible, the pill draws the focus ring through `has-focus-visible:` classes. The device hint ("Your device is set to {city} time." plus "Use {city} time") shows when `isValidTimeZone(device) && !sameZone(timeZone, device)`. The validity guard is there because `sameZone` throws on a junk zone.
- **Day chips**: native radios (`name="day"`) in a `<fieldset>` with an sr-only legend. Each `<label class="relative">` holds an `sr-only peer` input and a visible box styled with `peer-checked:` and `peer-focus-visible:`. The box uses the same ring as the global `:focus-visible`: ink outline, 2px offset, brand halo. Each chip shows the weekday, the date and a footer: "1 slot", "{n} slots" or "Full". Full days get `bg-full`. The arrow buttons `scrollBy` the row's own `clientWidth`, and `scroll-smooth motion-reduce:scroll-auto` handles the animation. The row has 4px padding so the scroll box doesn't clip the focus ring.
- **Slots**: native radios (`name="slot"`), with full hours `disabled` and styled through `peer-disabled:`. A full hour shows "Full" under its time. A mixed-offset day appends `zoneAbbreviation` to every label. "Greyed-out times are full: every mentor is booked then." appears under the grid when any hour that day is full.
- **Clock-change notice**: shown when `change && key >= change.dayKey`, using the brief's copy. A mixed day appends " On this day each time shows its zone."
- **Empty day**: "Every mentor is booked on {day}.", then "The nearest days with open times:" with a button for each of `before` and `after` ("{day} · {n} times"). If neither exists, it shows the "No times are open in the next 14 days. Please check back soon." copy. Jumping moves focus to the newly checked day radio, because the clicked button disappears.
- **409** (ruling): `UnavailableAlert` has `role="alert"`. It says "Sorry, {time} {abbr} on {date} is no longer available." and "The nearest open times are below. Pick one and confirm again. Your details are kept.", followed by buttons from `nearestOpenTimes(shownSlots, state.unavailable)`. These are computed at render from the current query data, so they repaint when the refetch lands. A button label carries the date only when the alternative isn't on the shown day. Picking one runs `flushSync(slotSelected)` and then focuses Confirm. The `onUnavailable` callback also dispatches `daySelected` for the attempted day, so the page stays on that day even if it just filled up.
- **Confirm**: `disabled={!selected || book.isPending || book.isSuccess}`, with `disabled:bg-full disabled:text-ink-soft disabled:cursor-not-allowed` added to `primaryButton`. The label is "Booking…" while busy, "Confirm {Tue 27 Oct}, {4:00 PM} {GMT}" with a selection, and "Choose a time" without one. **Double-submit guard:** a `useRef` flag is set on the first click and cleared only in `onError`. TanStack notifies observers through `setTimeout(0)`, so `disabled` arrives one task after the click. In the browser, right after Playwright's `dblclick` the button still read "Confirm Wed 28 Oct, 9:00 PM GMT", which is that window. The ref closes it.
- **Focus**: a `useEffect` keyed on `state.step` focuses the step heading (`tabIndex={-1}`). A ref holding the last step skips the first load.
- **Demo banner** above the card when `data.demo`. **Loading**: `role="status"` "Loading times…". **Load error**: "We couldn't load times." plus "Try again", which calls `refetch()`. While that refetch runs, the page shows "Loading times…" again (`error && !isFetching`).
- No raw hex, no `useMemo`, `useCallback` or `useOptimistic`, no fetching in effects, and no local-time `Date` getters (grep below).

## Tests and checks

- `npm run typecheck && npm run build`: exit 0 (`index-*.css` 15.17 kB, `index-*.js` 275.72 kB). The built CSS contains every `has-focus-visible:`, `peer-focus-visible:`, `peer-checked:`, `peer-disabled:` and `disabled:` rule used.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): `Test Files 8 passed (8)`, `Tests 107 passed (107)` in each zone.
- `grep -nE "#[0-9a-fA-F]{3,6}\b|useMemo|useCallback|useOptimistic|getHours|getDate\(|getDay\(|Date\.now|new Date\(\)"` on both files finds nothing.

### TDD evidence
None in the red/green sense: the brief has no unit test for this task. Its Steps 2–3 are the typecheck, the build and the browser check. The pure logic it consumes is tested in Tasks 2 and 9. Two browser findings acted as red-then-green:
1. **Chip row overflow.** RED: screenshot `2a` shows the 14 chips spilling past the card. A `<fieldset>` defaults to `min-inline-size: min-content`. GREEN: `min-w-0` on the fieldset; afterwards the row is 310px wide and scrolls 1120px (`2b` onwards).
2. **Focus lost after picking a 409 alternative.** RED: `document.activeElement` was `<body>`, because `focus()` on the still-disabled Confirm is a no-op and the alert holding the clicked button unmounts. GREEN: `flushSync` the selection, then focus; `activeElement` became `BUTTON "Confirm Wed 28 Oct, 9:00 PM GMT"`.

I also tried to prove the double-submit ref is load-bearing by removing it temporarily and double-clicking. The permission classifier denied that edit, so I did not do it. The evidence is the observed stale "Confirm…" label right after the double-click, plus TanStack's `setTimeout(0)` scheduler (`node_modules/@tanstack/query-core/build/modern/notifyManager.js`).

### Browser check (Playwright; `docker compose down -v && docker compose up -d db mailpit`, `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server`, `npm run dev`; zone set to London)
Screenshots are in the git-ignored `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/.playwright-mcp/task-11-shots/`. Task 10 found Playwright won't write to the scratchpad.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Step 1 blocks empty or invalid fields natively | PASS | Empty submit: all three report "Please fill in this field."; "not-an-email" reports the missing "@"; the step stays on "Your details". `1-step1-invalid-email.png` |
| 2 | 14 chips with counts and a "Full" day; Sun 25 Oct lists 1:00 AM BST and 1:00 AM GMT; Tue 27 Oct GMT notice; a full hour greyed with "Full" | PASS | Chips Tue 20 Oct to Mon 2 Nov, with Fri 23 Oct "Full" (`2a`, taken before the overflow fix). Sun 25: 12:00 AM BST, 1:00 AM BST, 1:00 AM GMT, 9:00 AM GMT and on, plus "…On this day each time shows its zone." (`2b`). Mon 26 Oct 4:00 PM "Full" plus the greyed-out line (`2c`). Tue 27 Oct: "Clocks in London change on Sun 25 Oct. Times from then on are GMT, not BST." (`2d`) |
| 3 | A full day shows the nearest open days | PASS | Fri 23 Oct: "Every mentor is booked on Fri 23 Oct." with "Thu 22 Oct · 3 times" and "Sat 24 Oct · 2 times" (`3a`). Clicking Sat 24 checks and focuses that chip (`3b`) |
| 4 | 409 in two tabs: alert with three alternatives, details kept | PASS | I filled 4 of the 5 UK-shift mentors at Wed 28 Oct 17:00 UTC via the API; Vikram Rao was left. Tab B booked it (`4a`). Tab A's confirm got "Sorry, 5:00 PM GMT on Wed 28 Oct is no longer available." with 3:00 PM GMT, 4:00 PM GMT and 9:00 PM GMT, and the refetch greyed 5:00 PM as Full (`4b`). Back showed "Asha Patel", "asha@example.com", "Rohan" (`4c`). A second 409 then confirmed that picking an alternative focuses Confirm (`4d`) |
| 5 | Double-clicking Confirm creates one booking (Mailpit +2) | PASS | `dblclick` sent 1 POST. Mailpit total went 20 → 22: 1 to `asha@example.com` and 1 to the mentor (Sneha Kulkarni). `/api/mentors` shows one booking at that hour. `5-double-click-one-booking.png` |
| 6 | Zone change keeps the time on its New York day | PASS | Picked Wed 28 Oct 1:00 AM GMT in London (`6a`), then switched to New York: pill "New York", chip Tue 27 Oct checked, slot 9:00 PM checked, Confirm "Confirm Tue 27 Oct, 9:00 PM EDT" (`6b`) |
| 7 | Keyboard: tab and arrows through chips and slots with a visible focus | PASS | Tab then ArrowRight moved to and checked Wed 28 Oct; the chip box computed `outline: solid 2px rgb(47,79,79)` with a `0 0 0 4px rgb(251,182,0)` halo (`7a`). Tab, Tab, ArrowRight in the slots skipped the three full hours and checked 6:00 PM, with a solid 2px outline. The 7b screenshot was denied by the permission classifier; the ring is visible on 6:00 PM in `8-phone-375.png` |
| 8 | 375px: no horizontal page scroll | PASS | `scrollWidth` 375 = `clientWidth` 375; card 343px; chip row 213px, scrolling 1120px internally. `8-phone-375.png` |
| extra | 400 with fields goes back to step 1 | PASS | Name "Asha\u0007Patel" passed the native checks; Confirm returned 400. The step returned to "Your details" with focus on it, and the name field showed "No line breaks or control characters" with `aria-invalid="true"`; the other details were kept. Checked by DOM read; the screenshot was denied |

Console: only the expected 409 and 400 network errors.
Not browser-checked: the slots load-error state ("We couldn't load times." / "Try again"). It would need the API stopped mid-session.

Processes: both servers ran as harness background tasks (port 3000 PID 6924, port 5173 PID 6956, read from `lsof`). I stopped them through their task IDs. Afterwards `lsof` shows both ports free and `ps` shows both PIDs gone. No other PID was touched. The `db` and `mailpit` containers are left running. The demo database now holds my test bookings; `docker compose down -v` resets it.

## Files changed
- `src/web/BookingPage.tsx` (new, 377 lines)
- `src/web/App.tsx` (route `/` → `BookingPage`)

## Self-review and concerns
- **Extras beyond the brief, each small:**
  - the `useRef` double-submit guard (Review Focus 1);
  - `daySelected` dispatched before `slotUnavailable` on a 409, which keeps the attempted day on screen;
  - focus moves after the empty-day jump and after picking an alternative;
  - `has-focus-visible:` ring on the zone pill;
  - the zone abbreviation in the 409 heading and in alternative labels, so a repeated 1:00 AM is never ambiguous;
  - "1 time" vs "{n} times" pluralisation on the nearest-day buttons (the brief writes "{n} times").
- **The selected chip can sit outside the visible part of the chip row** after a zone change or on first load (the row shows about 4 chips on desktop and 2.5 on a phone). Keyboard focus and the empty-day jump scroll it into view. A plain zone change doesn't, because that would need a second, DOM-scrolling `useEffect`. Add one if reviewers want it.
- **Whitespace-only names pass step 1** (`required` accepts spaces; the trim happens afterwards). The server's 400 then routes back to step 1 with "Required" beside the field, which is the designed path. A native `pattern` could catch it earlier with a generic browser message.
- **A selected slot that turns full on a refetch stays selected** (checked and disabled), and Confirm stays enabled, as the ruling says (it only drops selections outside the 14 days). Confirming then takes the 409 path with alternatives.
- **The permission classifier denied three actions:**
  - the temporary guard-removal edit (the mutation check of the ref);
  - one `browser_run_code_unsafe` call;
  - two screenshots (7b, and the extra 400 check).
  I didn't work around them. The checks themselves were done with the standard Playwright tools and DOM reads.
- `2a-step2-london-chips.png` was taken before the overflow fix, so it shows the chips spilling past the card. Every later screenshot is after the fix.

---

# Fix round 1

Commit: `547c27e fix(web): lock back while a booking is in flight and keep the chosen day in view` (1 file, +16 −4, no trailer).

## What changed (`src/web/BookingPage.tsx`)
1. **Back is disabled while busy.** `busy` (`book.isPending || book.isSuccess`) now sits before the step 2 header, and the Back button has `disabled={busy}`, `enabled:hover:bg-brand-50`, `disabled:cursor-not-allowed` and `disabled:text-ink-soft`. Step 1 can't be reached during a request, so `book.reset()` can't detach the in-flight mutation's per-call `onError` and leave `sending` stuck at `true`. The ref is still cleared only in `onError`, as the review asked; clearing it in `onSubmit` would reopen the double POST.
2. **The chosen day stays in view after a zone change.** A `changeZone(tz)` helper runs `flushSync(() => setTimeZone(tz))`, then `scrollIntoView({ block: 'nearest', inline: 'nearest' })` on the checked day chip's label. The select's `onChange` and the "Use {city} time" button both go through it. There is no effect.

The copy extras (the zone abbreviation in the 409 heading, and "1 time") are unchanged. Whitespace-only names and the alternative-pick `flushSync` are unchanged too.

## Commands and output
- `npm run typecheck && npm run build`: exit 0 (`index-*.js` 275.94 kB). The built CSS contains `.enabled\:hover\:bg-brand-50:enabled:hover{background-color:var(--color-brand-50)}`.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): `Test Files 8 passed (8)`, `Tests 107 passed (107)` in each zone.
- Browser re-check. Setup as before: `docker compose down -v && docker compose up -d db mailpit`, then both servers as background tasks (port 3000 PID 10102, port 5173 PID 10136, read from `lsof`), stopped afterwards through their task IDs. Ports 3000 and 5173 are free and both PIDs are gone. The `db` and `mailpit` containers are still running.
  - **Zone change, far-right day:** in London I picked Mon 2 Nov (the rightmost chip) at 11:00 PM GMT, then scrolled the chip row to `scrollLeft` 0. The checked chip was then out of view (`checkedInView: false`). Switching to New York left the pill reading "New York", chip `2026-11-02` checked, slot `2026-11-02T23:00:00.000Z` checked and Confirm reading "Confirm Mon 2 Nov, 6:00 PM EST". The row scrolled to 806 of a maximum 810, and the chip's right edge sits flush at 795 = row right 795 (`checkedInView: true`). `window.scrollY` stayed 0, so the page itself didn't jump. A first reading 600 ms after the change was taken mid-animation (`scroll-smooth`); the re-reading is the settled state. Screenshot: `.playwright-mcp/task-11-shots/fix1-zone-change-keeps-chip-in-view.png` (the New York clock-change notice also shows, since Mon 2 Nov is after Sun 1 Nov).
  - **Back locked in flight:** before Confirm, `back.disabled` was false. 15 ms after `confirm.click()` it was true, with Confirm disabled and reading "Booking…". The page then navigated to `/bookings/01c86c49-…`.
- No browser action was denied this round.
