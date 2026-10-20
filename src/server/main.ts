import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp, createClock } from './app.ts';
import { createPool, migrate } from './db.ts';
import { createSmtpMailer } from './email.ts';
import { seed } from './seed.ts';

const { DATABASE_URL = 'postgres://bookings:bookings@localhost:5433/bookings', SMTP_URL = 'smtp://localhost:1025', APP_URL = 'http://localhost:3000', PORT = '3000', DEMO_NOW } = process.env;

const clock = createClock(DEMO_NOW);
const pool = createPool(DATABASE_URL);
await migrate(pool);
await seed(pool, clock.now());

// the web build arrives with the front end; until `dist/web/index.html` exists the server is API-only
const webDir = new URL('../../dist/web/', import.meta.url);
const app = createApp({
  pool,
  clock,
  mailer: createSmtpMailer(SMTP_URL),
  appUrl: APP_URL,
  webDir: existsSync(new URL('index.html', webDir)) ? fileURLToPath(webDir) : undefined,
});

app.listen(Number(PORT), (err?: Error) => {
  if (err) throw err; // Express 5 hands a failed listen (such as a busy port) to this callback
  console.log(`listening on ${APP_URL}${clock.demo ? ` (demo clock from ${DEMO_NOW})` : ''}`);
});
