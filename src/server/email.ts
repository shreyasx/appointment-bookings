import nodemailer from 'nodemailer';
import { cityName, formatDate, formatOtherTime, formatSpan, formatWhen } from '../shared/time.ts';

export type EmailMessage = { to: string; subject: string; text: string };
export type Mailer = { send(message: EmailMessage): Promise<void> };
export type EmailBooking = { id: string; startsAt: Date; parentName: string; parentEmail: string; childName: string; parentTimeZone: string;
  classLink: string; mentor: { name: string; email: string; timeZone: string } };

const CLASS_MINUTES = 60;
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** One email per side; each leads with its reader's own time and adds the other side's time (with its date when the days differ). */
export function renderEmails(b: EmailBooking, appUrl: string): { parent: EmailMessage; mentor: EmailMessage } {
  const start = b.startsAt;
  const end = new Date(start.getTime() + CLASS_MINUTES * 60_000);
  const { mentor } = b;
  const when = (tz: string) => `${formatDate(start, tz)}, ${formatSpan(start, end, tz)}`;

  const parent = [
    `Hi ${first(b.parentName)},`,
    '',
    `${b.childName}'s free trial class is booked.`,
    '',
    `When: ${when(b.parentTimeZone)}`,
    `Mentor: ${mentor.name}, joining from ${cityName(mentor.timeZone)}, where it's ${formatOtherTime(start, mentor.timeZone, b.parentTimeZone)}`,
    `Class link: ${b.classLink}`,
    '',
    `See your booking: ${appUrl}/bookings/${b.id}`,
  ];
  const mentorText = [
    `Hi ${first(mentor.name)},`,
    '',
    'You have a new trial class.',
    '',
    `When: ${when(mentor.timeZone)}`,
    `For the family: ${formatOtherTime(start, b.parentTimeZone, mentor.timeZone)} in ${cityName(b.parentTimeZone)}`,
    `Child: ${b.childName}`,
    `Parent: ${b.parentName}`,
    `Class link: ${b.classLink}`,
  ];

  return {
    parent: { to: b.parentEmail, subject: `${b.childName}'s free trial class: ${formatWhen(start, b.parentTimeZone)}`, text: parent.join('\n') },
    mentor: { to: mentor.email, subject: `New trial class: ${formatWhen(start, mentor.timeZone)}`, text: mentorText.join('\n') },
  };
}

/** Sends through the given SMTP url. A refused connection rejects; there are no retries. */
export function createSmtpMailer(smtpUrl: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: 'Codeyoung Trials <trials@codeyoung.example>', to, subject, text });
    },
  };
}
