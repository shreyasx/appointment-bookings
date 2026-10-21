### Task 11: Booking page

**Files:**
- Create: `src/web/BookingPage.tsx`
- Modify: `src/web/App.tsx` (route `/` → `BookingPage`)

**Interfaces:**
- Consumes:
  - `useTimeZone`, `useSlots`, `useBookSlot` (Task 10);
  - every export of `src/web/booking.ts` (Task 9);
  - the formatters (Task 2);
  - `Card`, `CardTitle`, `Progress`, `DemoBanner` (Task 10).

- [ ] **Step 1: Implement `BookingPage.tsx`** following spec §10. These decisions aren't in the spec:
  - **State**: `useReducer(flowReducer, initialFlow)`. Compute these in render, never in an effect:
    - `days = groupIntoDays(slots, timeZone, new Date(data.now))`;
    - `key = shownDayKey(…)`.
  - **Step 1 form**:
    - `required` fields, `type="email"`, `maxLength={80}`.
    - On submit, dispatch `detailsSubmitted` with trimmed values.
  - **Zone pill**:
    - The visible pill shows a globe icon, `cityName(timeZone)` and a chevron.
    - A native `<select>` covers it with `absolute inset-0 opacity-0`. It has an accessible name ("Time zone") and two optgroups, "Common" and "All time zones", built from `zoneOptions(timeZone, now)`.
    - If `!sameZone(timeZone, deviceTimeZone)`, show "Your device is set to {city} time." with a button "Use {city} time".
  - **Days and slots**:
    - Both are native radios in a `<fieldset>` with an `sr-only` legend. Each `<input class="sr-only peer">` is styled through `peer-checked:` / `peer-focus-visible:` / `peer-disabled:`.
    - Chip footer: "1 slot", "{n} slots", or "Full".
    - Arrow buttons scroll the chip row by its own width.
  - **Notices and alerts**, using the spec §10 copy:
    - The clock-change notice shows when `key >= change.dayKey`: "Clocks in {city} change on {formatDayKey(change.dayKey)}. Times from then on are {to}, not {from}." A mixed day appends "On this day each time shows its zone." and its slot labels include `zoneAbbreviation`.
    - Under the grid when any hour is full: "Greyed-out times are full: every mentor is booked then."
    - Empty day: "Every mentor is booked on {day}.", then "The nearest days with open times:" with buttons "{day} · {n} times". If there are none on either side: "No times are open in the next 14 days. Please check back soon."
    - On a 409, a `role="alert"` box: "Sorry, {time} on {date} is no longer available." and "The nearest open times are below. Pick one and confirm again. Your details are kept." It has buttons from `nearestOpenTimes`, and a label includes the date when it isn't the shown day.
  - **Confirm button**:
    - Label: "Confirm {formatDate}, {formatTime} {abbr}", or "Choose a time" when nothing is selected.
    - **Disabled while `book.isPending || book.isSuccess`**, and the label reads "Booking…". `isSuccess` covers the gap between the response and the page unloading after `location.assign`.
  - **Focus**: when the step changes, move focus to the step heading (`tabIndex={-1}`).
  - **Demo banner**: show it above the card when `data.demo`.
  - **Loading and errors**: "Loading times…" while loading. On a load error: "We couldn't load times." with a "Try again" button that calls `refetch`.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: exit 0.

- [ ] **Step 3: Check every state in the browser**
  - **Setup:** `docker compose down -v && docker compose up -d db mailpit`, then `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server` and `npm run dev`. Use the browser with the zone set to London.

Expected:
1. **Step 1** blocks empty or invalid fields natively.
2. **Step 2**:
   - shows 14 chips with counts, including at least one "Full" day from the seed;
   - Sun 25 Oct lists "1:00 AM BST" and "1:00 AM GMT";
   - Tue 27 Oct shows the GMT notice;
   - a full hour is greyed with "Full".
3. **A full day** shows the nearest open days.
4. **The 409 path:** pick the same last free hour in two tabs and confirm both. The second shows the alert with three alternatives, and the details are kept.
5. **Double-clicking Confirm** creates one booking: Mailpit gets 2 emails, not 4.
6. **Zone change:** switch to "New York" after picking a time. The time stays selected on its New York day.
7. **Keyboard:** tab and arrow keys move through chips and slots with a visible focus.
8. **Phone width (375px):** no horizontal page scroll.

Take a screenshot of each state with the browser tool.

- [ ] **Step 4: Commit**

```bash
git add src/web/BookingPage.tsx src/web/App.tsx
git commit -m "feat(web): add the booking page with zone pill, day chips, full and 409 states"
```

---

