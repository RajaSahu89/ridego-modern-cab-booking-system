// One command to get the database ready: creates it if missing, then creates all tables.
// Safe to run again at any time (it never deletes data).
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { q, initDb, cleanUrl, sslFor, isPlaceholderUrl } from '../src/db.js';

const url = process.env.DATABASE_URL;
if (isPlaceholderUrl(url)) {
  console.error('DATABASE_URL in backend/.env is missing or still the example value. Edit it, then run this again.');
  process.exit(1);
}

// Connect to the server's default "postgres" database and create ours.
async function createDatabase() {
  const u = new URL(cleanUrl(url));
  const name = decodeURIComponent(u.pathname.slice(1));
  u.pathname = '/postgres';
  const connectionString = u.toString();
  let ssl = sslFor(url);
  for (let attempt = 0; attempt < 2; attempt++) {
    const admin = new pg.Client({ connectionString, ssl });
    try {
      await admin.connect();
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`Created database "${name}".`);
      return;
    } catch (e) {
      if (ssl && /does not support SSL/i.test(e.message)) { ssl = false; continue; }
      throw e;
    } finally {
      await admin.end().catch(() => {});
    }
  }
}

try {
  try {
    await initDb();
  } catch (e) {
    if (e.code !== '3D000') throw e;
    await createDatabase();
    await initDb();
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  await q(fs.readFileSync(path.join(here, '..', 'schema.sql'), 'utf8'));
  console.log('Database is ready: users, drivers, rides and ratings tables exist.');
  process.exit(0);
} catch (e) {
  console.error(`\nDatabase setup failed: ${e.message || e.code}`);
  if (e.code === '28P01') console.error('Wrong username or password in DATABASE_URL (backend/.env).');
  else if (e.code === 'ECONNREFUSED' || e.errors?.[0]?.code === 'ECONNREFUSED')
    console.error('Postgres is not running on that host/port. Start the PostgreSQL service, or check the port in DATABASE_URL.');
  else if (e.code === 'ENOTFOUND') console.error('The host in DATABASE_URL was not found. Check for typos.');
  else console.error('Check DATABASE_URL in backend/.env.');
  process.exit(1);
}
