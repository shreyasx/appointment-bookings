import { ConfirmationPage } from './ConfirmationPage.tsx';
import { Card } from './ui.tsx';

function NotFound() {
  return (
    <Card>
      <h1 className="text-2xl font-medium">We couldn't find that page.</h1>
      <a href="/" className="mt-4 inline-block font-bold underline underline-offset-4">Back to the home page</a>
    </Card>
  );
}

export function App() {
  const bookingId = /^\/bookings\/([0-9a-f-]{36})$/.exec(location.pathname)?.[1];
  return (
    <>
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <a href="/" className="text-xl font-bold">Codeyoung</a>
        <a href="/mentors" className="text-sm font-medium underline-offset-4 hover:underline">Our mentors</a>
      </header>
      <main className="px-4 pb-12">{bookingId ? <ConfirmationPage id={bookingId} /> : <NotFound />}</main>
    </>
  );
}
