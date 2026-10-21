import { expect, test } from 'vitest';
import { renderEmails, type EmailBooking } from './email.ts';

const b: EmailBooking = {
  id: 'b1',
  startsAt: new Date('2026-10-27T16:00:00Z'),
  parentName: 'Asha Patel',
  parentEmail: 'asha@example.com',
  childName: 'Rohan',
  parentTimeZone: 'Europe/London',
  classLink: 'https://classroom.example/trial/abc',
  mentor: { name: 'Priya Sharma', email: 'priya.sharma@mentors.example', timeZone: 'Asia/Kolkata' },
};

test("the parent's email leads with the parent's time", () => {
  const { parent } = renderEmails(b, 'http://localhost:3000');
  expect(parent.to).toBe('asha@example.com');
  expect(parent.subject).toBe("Rohan's free trial class: Tue 27 Oct, 4:00 PM GMT (London)");
  expect(parent.text).toContain('When: Tue 27 Oct, 4:00–5:00 PM GMT (London)');
  expect(parent.text).toContain(
    "Mentor: Priya Sharma, joining from Kolkata, where it's 9:30 PM IST",
  );
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
  expect(
    renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').parent.subject,
  ).toBe("Rohan's free trial class: Fri 23 Oct, 4:00 PM BST (London)");
  expect(
    renderEmails(
      { ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-11-03T15:00:00Z') },
      '',
    ).parent.subject,
  ).toBe("Rohan's free trial class: Tue 3 Nov, 10:00 AM EST (New York)");
  expect(
    renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').mentor.text,
  ).toContain('For the family: 4:00 PM BST in London');
});

test("each side sees the other side's date when the days differ", () => {
  const { parent, mentor } = renderEmails(
    { ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-10-26T21:00:00Z') },
    '',
  );
  expect(parent.text).toContain(
    "Mentor: Priya Sharma, joining from Kolkata, where it's Tue 27 Oct, 2:30 AM IST",
  );
  expect(mentor.text).toContain('For the family: Mon 26 Oct, 5:00 PM EDT in New York');
});
