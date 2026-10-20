import { useQuery } from '@tanstack/react-query';
import { cityName, formatDateWithYear, formatOtherTime, formatSpan } from '../shared/time.ts';
import { ApiError, getBooking } from './api.ts';
import { Avatar, Card, Progress } from './ui.tsx';

export function ConfirmationPage({ id }: { id: string }) {
  const { data, error } = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) });

  if (!data) {
    return (
      <Card>
        {!error ? (
          <p role="status">Loading your booking…</p>
        ) : error instanceof ApiError && error.status === 404 ? (
          <>
            <h1 className="text-2xl font-medium">We couldn't find that booking.</h1>
            <a href="/" className="mt-4 inline-block font-bold underline underline-offset-4">Back to the home page</a>
          </>
        ) : (
          <p role="alert" className="text-alert">We couldn't load your booking. Please refresh the page to try again.</p>
        )}
      </Card>
    );
  }

  const { booking: b } = data;
  const start = new Date(b.startsAt);
  const end = new Date(b.endsAt);
  const tz = b.parentTimeZone;

  return (
    <Card>
      <Progress step={3} />
      <h1 className="text-2xl font-medium">You're booked!</h1>
      <p className="mt-1 text-ink-soft">{b.childName}'s free trial class</p>

      <div className="mt-6 rounded-field bg-brand-50 p-4">
        <p className="font-bold">{formatDateWithYear(start, tz)}</p>
        <p>{formatSpan(start, end, tz)}</p>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        Your mentor joins from {cityName(b.mentor.timeZone)}, where it's {formatOtherTime(start, b.mentor.timeZone, tz)}.
      </p>

      <section aria-label="Your mentor" className="mt-6 flex gap-4 rounded-field border border-line p-4">
        <Avatar name={b.mentor.name} />
        <div>
          <h2 className="font-bold">{b.mentor.name}</h2>
          <p className="text-sm text-ink-soft">{b.mentor.subjects.join(', ')}</p>
          <p className="mt-2 text-sm">{b.mentor.bio}</p>
        </div>
      </section>

      <a
        href={b.classLink}
        target="_blank"
        rel="noreferrer"
        className="mt-6 block w-full rounded-cta bg-brand py-4 text-center text-sm font-bold text-ink"
      >
        Join class
      </a>
      <p className="mt-2 break-all text-center text-sm text-ink-soft">{b.classLink}</p>

      <p className="mt-6 text-sm text-ink-soft">We've emailed this to {b.parentEmail}.</p>
    </Card>
  );
}
