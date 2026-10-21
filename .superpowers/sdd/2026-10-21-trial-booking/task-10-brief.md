### Task 10: Web shell, API client, hooks, confirmation page

**Files:**
- Create: `index.html`, `src/web/index.css`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/hooks.ts`, `src/web/ui.tsx`, `src/web/ConfirmationPage.tsx`
- Modify:
  - `vite.config.ts`: add `react()` and `tailwindcss()` plugins, `build.outDir: 'dist/web'`, and `server.proxy: { '/api': 'http://localhost:3000' }`.
  - `package.json`: dev dependencies `vite @vitejs/plugin-react react react-dom @tanstack/react-query tailwindcss @tailwindcss/vite @types/react @types/react-dom`; scripts `"dev": "vite"` and `"build": "vite build"`.
  - `tsconfig.json`: `"types": ["node", "vite/client"]`. TypeScript 7 checks side-effect imports, so `import './index.css'` needs Vite's client types.

**Interfaces:**
- Consumes:
  - the types (Task 7);
  - `initialTimeZone` (Task 9);
  - the formatters (Task 2).
- Produces:
  - `api.ts`:
    - `class ApiError extends Error { status: number; code: ErrorCode; fields: Record<string, string> }`, with fields assigned in the constructor body;
    - `getSlots(): Promise<SlotsResponse>`;
    - `getMentors(): Promise<MentorsResponse>`;
    - `getBooking(id: string): Promise<BookingResponse>`;
    - `createBooking(body: BookingRequest): Promise<BookingResponse>`.
  - `hooks.ts`:
    - `useTimeZone(): { timeZone: string; setTimeZone(tz: string): void; deviceTimeZone: string }`;
    - `useSlots()`: `useQuery` keyed `['slots']`, `refetchInterval: 60_000`;
    - `useBookSlot(onUnavailable: (startsAt: string) => void)`: `useMutation`. On success it calls `location.assign('/bookings/' + id)`. On a 409 it calls `queryClient.invalidateQueries({ queryKey: ['slots'] })` and `onUnavailable(variables.startsAt)`.
  - `ui.tsx`, using the sizes from spec §10:
    - `Card({ children })`: `rounded-card border border-line bg-white shadow-card`, 32px padding, up to 440px wide, full width on phones;
    - `CardTitle()`: "Book a FREE class for your child", 24px medium, with "FREE" underlined in `decoration-brand`;
    - `Progress({ step: 1 | 2 | 3 })`: three 64×4px segments, `bg-brand` up to `step` and `bg-line` after;
    - `DemoBanner({ now: string; timeZone: string })`: takes `now` as the server's ISO string.
  - Every primary button is full width, 14px bold, with 16px vertical padding, `rounded-cta bg-brand text-ink`.
  - `App.tsx`: a `location.pathname` switch, with routes added by Tasks 11–12.

- [ ] **Step 1: Write the styles and entry**
  - **`index.css`**:
    - `@import "tailwindcss";`
    - the `@theme` block copied **verbatim** from spec §10;
    - `body` uses `bg-page text-ink antialiased`;
    - a visible `:focus-visible` outline in `brand`.
  - **`index.html`**:
    - Fontshare's Satoshi `<link>` (spec §10);
    - `<div id="root">`;
    - `<script type="module" src="/src/web/main.tsx">`.
  - **`main.tsx`**: a `QueryClientProvider` whose queries don't retry `ApiError` with `status < 500`.

- [ ] **Step 2: Implement `api.ts`, `hooks.ts`, `ui.tsx`, `App.tsx` and `ConfirmationPage.tsx`**
  - **`useTimeZone`**:
    - Initial state is `initialTimeZone(read('tz'), device)`, where `device` is `Intl.DateTimeFormat().resolvedOptions().timeZone`.
    - `setTimeZone` writes `localStorage.tz`.
    - Wrap both the read and the write in `try`.
  - **App**:
    - Header: a "Codeyoung" wordmark (`<a href="/">`) and an `<a href="/mentors">` link labelled "Our mentors".
    - Routes: `/^\/bookings\/([0-9a-f-]{36})$/` renders `ConfirmationPage`, and anything else renders a not-found card with a link home.
  - **ConfirmationPage** (spec §10), using `useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) })`:
    - `Progress step={3}`.
    - "You're booked!"
    - "{childName}'s free trial class"
    - `formatDateWithYear`, then `formatSpan(start, end, parentTimeZone)`.
    - "Your mentor joins from {city}, where it's {formatOtherTime(start, mentor zone, parentTimeZone)}."
    - A mentor card with initials, name, subjects and bio.
    - A "Join class" button linking `classLink`, with the link text shown beneath it.
    - "We've emailed this to {parentEmail}."
    - A 404 shows "We couldn't find that booking." and a link home.
  - **DemoBanner** text: `Demo clock: it's ${formatDateWithYear(now, tz)}, ${formatTime(now, tz)} in ${cityName(tz)}`.

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: exit 0, and `dist/web/index.html` exists.

- [ ] **Step 4: Check it in the browser**
  1. Start `npm run dev:server` and `npm run dev`.
  2. Create a booking: `curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' -d '{"startsAt":"<an available startsAt from /api/slots>","parentName":"Asha Patel","parentEmail":"asha@example.com","childName":"Rohan","parentTimeZone":"Europe/London"}'`.
  3. Open `http://localhost:5173/bookings/<id>`.

Expected:
- The confirmation matches spec §10.
- A made-up UUID shows the not-found copy.
- `/nope` shows the not-found card.

- [ ] **Step 5: Commit**

```bash
git add index.html vite.config.ts tsconfig.json package.json package-lock.json src/web/index.css src/web/main.tsx src/web/App.tsx src/web/api.ts src/web/hooks.ts src/web/ui.tsx src/web/ConfirmationPage.tsx
git commit -m "feat(web): add shell, palette, api client, hooks and confirmation page"
```

---

