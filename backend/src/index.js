import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { q, initDb, isPlaceholderUrl } from './db.js';
import { authRouter } from './auth.js';
import ridesRouter from './rides.js';

// ---- Fail early, with a plain-English reason, if .env is not filled in ----
const problems = [];
if (isPlaceholderUrl(process.env.DATABASE_URL))
  problems.push('DATABASE_URL is missing or still the example value. Put your real Postgres connection string in backend/.env');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me'))
  problems.push('JWT_SECRET is missing or still the example value. Run "npm run setup" (creates one) or set a long random string in backend/.env');
if (problems.length) {
  console.error('\nRideGo backend cannot start:\n' + problems.map((p) => '  - ' + p).join('\n') + '\n');
  process.exit(1);
}

const app = express();

// Allowed frontend origins. Empty CLIENT_URL = allow any. localhost is always allowed outside production.
const allowed = (process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';
const origin = (o, cb) => {
  if (!o || !allowed.length || allowed.includes(o)) return cb(null, true);
  if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return cb(null, true);
  cb(null, false);
};
app.use(cors({ origin }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin } });

app.get('/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});
app.use('/auth', authRouter);
app.use('/rides', ridesRouter(io));

// Turn common setup mistakes into a clear message instead of a bare "Server error".
const NET = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN', 'ECONNRESET'];
app.use((err, _req, res, _next) => {
  console.error(err);
  const code = err.code || err.errors?.[0]?.code;
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Invalid request' });
  if (code === '42P01')
    return res.status(503).json({ error: 'Database tables are missing. Run "npm run db:setup" in the ridego folder.' });
  if (NET.includes(code) || ['3D000', '28P01', '28000'].includes(code) || /SSL/i.test(err.message || ''))
    return res.status(503).json({ error: 'Cannot connect to the database. Check DATABASE_URL in backend/.env.' });
  res.status(500).json({ error: 'Server error' });
});

// Socket auth: same JWT as the REST API
io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

const safe = (fn) => (...args) => fn(...args).catch((e) => console.error(e));

io.on('connection', (socket) => {
  const { id, role } = socket.user;
  socket.join(`user:${id}`);
  if (role !== 'driver') return;

  socket.on('driver:online', safe(async (online) => {
    await q('UPDATE drivers SET is_online=$2 WHERE user_id=$1', [id, !!online]);
  }));

  // Live location: save the latest point, forward it to riders on this driver's active rides
  socket.on('driver:location', safe(async ({ lat, lng } = {}) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    await q('UPDATE drivers SET lat=$2, lng=$3, updated_at=now() WHERE user_id=$1', [id, lat, lng]);
    const { rows } = await q(
      "SELECT id, rider_id FROM rides WHERE driver_id=$1 AND status IN ('accepted','started')",
      [id]
    );
    rows.forEach((r) => io.to(`user:${r.rider_id}`).emit('driver:location', { rideId: r.id, lat, lng }));
  }));

  socket.on('disconnect', safe(async () => {
    await q('UPDATE drivers SET is_online=false WHERE user_id=$1', [id]);
  }));
});

const port = process.env.PORT || 4000;
server.listen(port, async () => {
  console.log(`API listening on ${port}`);
  // Check the database once at startup and say clearly what is wrong, if anything.
  try {
    await initDb();
    const { rows } = await q("SELECT to_regclass('public.users') AS t");
    if (rows[0].t) console.log('Database connected.');
    else console.error('\nDatabase is reachable but the tables do not exist yet. Run: npm run db:setup  (from the ridego folder)\n');
  } catch (e) {
    console.error(`\nCannot connect to the database: ${e.message || e.code}`);
    if (e.code === '3D000') console.error('That database does not exist. Run: npm run db:setup  (it creates it)');
    else if (e.code === '28P01') console.error('Wrong username or password in DATABASE_URL (backend/.env).');
    else console.error('Check DATABASE_URL in backend/.env and that Postgres is running.');
    console.error('');
  }
});
