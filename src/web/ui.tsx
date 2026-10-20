import type { ReactNode } from 'react';
import { cityName, formatDateWithYear, formatTime } from '../shared/time.ts';

export function Card({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[440px] rounded-card border border-line bg-white p-8 shadow-card">{children}</div>;
}

export function CardTitle() {
  return (
    <h1 className="text-2xl font-medium">
      Book a <span className="underline decoration-brand decoration-4 underline-offset-4">FREE</span> class for your child
    </h1>
  );
}

export function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div role="img" aria-label={`Step ${step} of 3`} className="mb-6 flex gap-2">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-1 w-16 rounded-field ${n <= step ? 'bg-brand' : 'bg-line'}`} />
      ))}
    </div>
  );
}

export function DemoBanner({ now, timeZone }: { now: string; timeZone: string }) {
  const at = new Date(now);
  return (
    <p className="mx-auto mb-4 w-full max-w-[440px] rounded-field bg-brand-50 px-4 py-2 text-center text-sm">
      {`Demo clock: it's ${formatDateWithYear(at, timeZone)}, ${formatTime(at, timeZone)} in ${cityName(timeZone)}`}
    </p>
  );
}

/** Initials in a soft square, for the mentor cards. */
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('');
  return (
    <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-cta bg-brand-100 font-bold">
      {initials}
    </span>
  );
}
