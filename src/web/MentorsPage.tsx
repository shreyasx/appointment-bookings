import { useQuery } from '@tanstack/react-query';
import { cityName, formatDayKey, formatTime, zoneAbbreviation } from '../shared/time.ts';
import type { MentorDto } from '../shared/types.ts';
import { getMentors } from './api.ts';
import { mentorDays } from './booking.ts';
import { useTimeZone } from './hooks.ts';
import { Avatar, Card, DemoBanner } from './ui.tsx';

export function MentorsPage() {
  const { data, error } = useQuery({ queryKey: ['mentors'], queryFn: getMentors });
  const { timeZone } = useTimeZone();

  if (!data) {
    return (
      <Card>
        {!error ? (
          <p role="status">Loading our mentors…</p>
        ) : (
          <p role="alert" className="text-alert">We couldn't load our mentors. Please refresh the page to try again.</p>
        )}
      </Card>
    );
  }

  const now = new Date(data.now);
  return (
    <>
      {data.demo && <DemoBanner now={data.now} timeZone={timeZone} />}
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-medium">Our mentors</h1>
        <ul className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {data.mentors.map((mentor) => (
            <li key={mentor.id} className="flex">
              <MentorCard mentor={mentor} now={now} />
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-sm text-ink-soft">Times only, no parent or child names.</p>
      </div>
    </>
  );
}

function MentorCard({ mentor, now }: { mentor: MentorDto; now: Date }) {
  const tz = mentor.timeZone;
  const days = mentorDays(mentor.bookings, tz);
  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={mentor.name} />
        <div>
          <h2 className="text-lg font-bold">{mentor.name}</h2>
          <p className="text-sm text-ink-soft">Teaches from {cityName(tz)} · {zoneAbbreviation(now, tz)}</p>
        </div>
      </div>
      <ul aria-label="Subjects" className="mt-4 flex flex-wrap gap-2">
        {mentor.subjects.map((subject) => (
          <li key={subject} className="rounded-field bg-full px-2 py-1 text-xs font-medium">{subject}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm">{mentor.bio}</p>

      <h3 className="mt-6 text-sm font-bold">Booked trial classes, in {mentor.name.split(' ')[0]}'s time</h3>
      {days.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No trial classes booked yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {days.map((day) => (
            <li key={day.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div>
                {day.times.map((startsAt) => {
                  const at = new Date(startsAt);
                  return <p key={startsAt}>{formatDayKey(day.key)} · {formatTime(at, tz)} {zoneAbbreviation(at, tz)}</p>;
                })}
              </div>
              {day.atCap && <span className="rounded-field bg-brand-100 px-2 py-0.5 text-xs font-bold">2 of 2 that day</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
