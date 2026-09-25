import pg from 'pg';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'];
const rawUrl = process.env.DATABASE_URL || '';

// We decide SSL ourselves (see sslFor), so drop any ?sslmode=... from the URL;
// otherwise the pg driver would let it override our choice.
export const cleanUrl = (cs) =>
  cs.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');

// SSL on for hosted databases (Supabase, Neon, Render...), off for a Postgres on this machine.
// Override with DATABASE_SSL=false (or true) in backend/.env.
export function sslFor(cs) {
  const flag = (process.env.DATABASE_SSL || '').toLowerCase();
  if (['false', '0', 'off', 'disable'].includes(flag)) return false;
  if (['true', '1', 'on', 'require'].includes(flag)) return { rejectUnauthorized: false };
  if (/[?&]sslmode=disable/i.test(cs)) return false;
  try {
    if (LOCAL_HOSTS.includes(new URL(cs).hostname)) return false;
  } catch { /* unusual URL: fall through to SSL, initDb() retries without it */ }
  return { rejectUnauthorized: false };
}

let pool;
let sslOn;

function makePool(ssl) {
  sslOn = !!ssl;
  pool = new pg.Pool({ connectionString: cleanUrl(rawUrl), ssl });
  // Hosted databases drop idle connections; without this handler that would crash Node.
  pool.on('error', (e) => console.error('Database connection error:', e.message));
  return pool;
}
makePool(sslFor(rawUrl));

export const q = (text, params) => pool.query(text, params);

// Run several queries as one all-or-nothing transaction.
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Verify the database is reachable. If the server turns out not to speak SSL
// (typical for a Postgres installed on your own PC), retry without it.
export async function initDb() {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    if (sslOn && /does not support SSL/i.test(e.message)) {
      await pool.end().catch(() => {});
      makePool(false);
      await pool.query('SELECT 1');
      console.log('This database does not use SSL, so connected without it.');
    } else {
      throw e;
    }
  }
}

export const isPlaceholderUrl = (u) => !u || /YOUR_PASSWORD|user:password@host/i.test(u);
