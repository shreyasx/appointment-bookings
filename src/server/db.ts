import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// pg turns a `date` into local midnight, which shifts a day in zones east of UTC. Keep it a plain 'YYYY-MM-DD'.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const MIGRATION_LOCK = 727001;

export function createPool(connectionString: string, max?: number): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // pg-pool stops listening for errors on a checked-out client; without this a dropped connection mid-transaction crashes the process.
  // A query in flight already rejects with the error, and any later query on the dead client rejects too, so nothing is lost by ignoring the event.
  pool.on('connect', (client) => client.on('error', () => {}));
  pool.on('error', (err: Error & { code?: string }) => {
    // 57P01: the server ended an idle connection, as a test teardown's `drop database ... with (force)` does.
    if (err.code !== '57P01') console.error('postgres pool error', err);
  });
  return pool;
}

export async function migrate(pool: pg.Pool): Promise<string[]> {
  const dir = new URL('../../migrations/', import.meta.url);
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set(
      (await client.query('select name from schema_migrations')).rows.map((r) => r.name),
    );
    const applied: string[] = [];
    for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      const sql = await readFile(new URL(name, dir), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [name]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      }
      applied.push(name);
    }
    return applied;
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    } finally {
      client.release();
    }
  }
}
