### Task 6: Emails

**Files:**
- Create: `src/server/email.ts`, `src/server/email.test.ts`
- Modify: `package.json` (dependency `nodemailer`; dev dependency `@types/nodemailer`)

**Interfaces:**
- Consumes: `formatWhen`, `formatDate`, `formatSpan`, `formatOtherTime`, `cityName` (Task 2).
- Produces (`src/server/email.ts`):

```ts
export type EmailMessage = { to: string; subject: string; text: string };
export type Mailer = { send(message: EmailMessage): Promise<void> };
export type EmailBooking = { id: string; startsAt: Date; parentName: string; parentEmail: string; childName: string; parentTimeZone: string;
  classLink: string; mentor: { name: string; email: string; timeZone: string } };
export function renderEmails(b: EmailBooking, appUrl: string): { parent: EmailMessage; mentor: EmailMessage };
export function createSmtpMailer(smtpUrl: string): Mailer;   // from 'Codeyoung Trials <trials@codeyoung.example>'
```

- [ ] **Step 1: Write the failing tests** in `src/server/email.test.ts`

```ts
const b: EmailBooking = { id: 'b1', startsAt: new Date('2026-10-27T16:00:00Z'), parentName: 'Asha Patel', parentEmail: 'asha@example.com',
  childName: 'Rohan', parentTimeZone: 'Europe/London', classLink: 'https://classroom.example/trial/abc',
  mentor: { name: 'Priya Sharma', email: 'priya.sharma@mentors.example', timeZone: 'Asia/Kolkata' } };

test("the parent's email leads with the parent's time", () => {
  const { parent } = renderEmails(b, 'http://localhost:3000');
  expect(parent.to).toBe('asha@example.com');
  expect(parent.subject).toBe("Rohan's free trial class: Tue 27 Oct, 4:00 PM GMT (London)");
  expect(parent.text).toContain('When: Tue 27 Oct, 4:00–5:00 PM GMT (London)');
  expect(parent.text).toContain("Mentor: Priya Sharma, joining from Kolkata, where it's 9:30 PM IST");
  expect(parent.text).toContain('Class link: https://classroom.example/trial/abc');
  expect(parent.text).toContain('See your booking: http://localhost:3000/bookings/b1');
});

test("the mentor's email leads with the mentor's own time", () => {
  const { mentor } = renderEmails(b, 'http://localhost:3000');
  expect(mentor.to).toBe('priya.sharma@mentors.example');
  expect(mentor.subject).toBe('New trial class: Tue 27 Oct, 9:30 PM IST (Kolkata)');
  expect(mentor.text).toContain('When: Tue 27 Oct, 9:30–10:30 PM IST (Kolkata)');
  expect(mentor.text).toContain('For the family: 4:00 PM GMT in London');
  expect(mentor.text).toContain('Child: Rohan');
  expect(mentor.text).toContain('Parent: Asha Patel');
});

test('abbreviations follow each side across the clock changes', () => {
  expect(renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').parent.subject)
    .toBe("Rohan's free trial class: Fri 23 Oct, 4:00 PM BST (London)");
  expect(renderEmails({ ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-11-03T15:00:00Z') }, '').parent.subject)
    .toBe("Rohan's free trial class: Tue 3 Nov, 10:00 AM EST (New York)");
  expect(renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').mentor.text).toContain('For the family: 4:00 PM BST in London');
});

test("each side sees the other side's date when the days differ", () => {
  const { parent, mentor } = renderEmails({ ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-10-26T21:00:00Z') }, '');
  expect(parent.text).toContain("Mentor: Priya Sharma, joining from Kolkata, where it's Tue 27 Oct, 2:30 AM IST");
  expect(mentor.text).toContain('For the family: Mon 26 Oct, 5:00 PM EDT in New York');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/email.test.ts`
Expected: FAIL, failing to resolve `./email.ts`.

- [ ] **Step 3: Implement `src/server/email.ts`**
  - The class ends 60 minutes after `startsAt`. `{first}` is the first word of the name. Body copy (exact):
    - **Parent email**:
      - "Hi {first},"
      - blank line
      - "{child}'s free trial class is booked."
      - blank line
      - "When: {formatDate}, {formatSpan}"
      - "Mentor: {mentor.name}, joining from {mentor city}, where it's {formatOtherTime(start, mentor zone, parent zone)}"
      - "Class link: {link}"
      - blank line
      - "See your booking: {appUrl}/bookings/{id}"
    - **Mentor email**:
      - "Hi {first},"
      - blank line
      - "You have a new trial class."
      - blank line
      - "When: {formatDate}, {formatSpan}" (in the mentor's zone)
      - "For the family: {formatOtherTime(start, parent zone, mentor zone)} in {parent city}"
      - "Child: {child}"
      - "Parent: {parentName}"
      - "Class link: {link}"
  - `createSmtpMailer` uses `nodemailer.createTransport(smtpUrl)` and `sendMail({ from, to, subject, text })`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/server/email.ts src/server/email.test.ts package.json package-lock.json
git commit -m "feat(email): render parent and mentor emails in each side's own zone"
```

---

