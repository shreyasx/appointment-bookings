### Task 12: Mentors page

**Files:**
- Create: `src/web/MentorsPage.tsx`
- Modify:
  - `src/web/App.tsx`: route `/mentors` → `MentorsPage`.
  - `src/web/booking.ts` and `src/web/booking.test.ts`: add `mentorDays`.

**Interfaces:**
- Consumes:
  - `getMentors` (Task 10);
  - the formatters (Task 2);
  - `DemoBanner`, `Card` (Task 10).
- Produces: `mentorDays(bookings: { startsAt: string }[], tz: string): { key: string; times: string[]; atCap: boolean }[]`, sorted by key, with each day's times sorted.

- [ ] **Step 1: Write the failing test** (append to `src/web/booking.test.ts`)

```ts
test("mentorDays groups by the mentor's own day and marks the cap", () => {
  const days = mentorDays([{ startsAt: '2026-10-27T22:00:00Z' }, { startsAt: '2026-10-27T16:00:00Z' }, { startsAt: '2026-10-28T15:00:00Z' }], 'Asia/Kolkata');
  expect(days).toEqual([
    { key: '2026-10-27', times: ['2026-10-27T16:00:00Z'], atCap: false },
    { key: '2026-10-28', times: ['2026-10-27T22:00:00Z', '2026-10-28T15:00:00Z'], atCap: true }, // 3:30 AM and 8:30 PM in Kolkata
  ]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/web/booking.test.ts -t mentorDays`
Expected: FAIL, `TypeError: mentorDays is not a function`.

- [ ] **Step 3: Implement `mentorDays` and `MentorsPage.tsx`**
  - **`mentorDays`**: `atCap` means `times.length >= 2`.
  - **The page** uses `useQuery({ queryKey: ['mentors'], queryFn: getMentors })`, plus `DemoBanner` when `demo`. Its heading is "Our mentors", and the cards sit in a 1-column grid on phones and 2 columns from `md` up. Each card shows:
    - initials;
    - the name;
    - "Teaches from {cityName} · {zoneAbbreviation(now)}";
    - subject chips;
    - the bio;
    - "Booked trial classes, in {first name}'s time", listing each time as "{formatDayKey(key)} · {formatTime} {abbr}". The cap day gets the badge "2 of 2 that day".
  - With no bookings, the card says "No trial classes booked yet."
  - The page footer says "Times only, no parent or child names."

- [ ] **Step 4: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, exit 0.

- [ ] **Step 5: Check it in the browser**

Setup: `docker compose down -v && docker compose up -d db mailpit`, then `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server` and `npm run dev`. Open `http://localhost:5173/mentors`.
Expected: 10 cards, with seeded classes listed in IST and at least one "2 of 2 that day" badge, as spec §10 describes.

- [ ] **Step 6: Commit**

```bash
git add src/web/MentorsPage.tsx src/web/App.tsx src/web/booking.ts src/web/booking.test.ts
git commit -m "feat(web): add the mentors showcase with booked times in each mentor's own zone"
```

---

