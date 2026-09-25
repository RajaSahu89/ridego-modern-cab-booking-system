import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, tx } from './db.js';
import { wrap } from './util.js';

const sign = (u) =>
  jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' });

export const requireAuth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
};

export const authRouter = express.Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

authRouter.post('/register', wrap(async (req, res) => {
  const { password, role } = req.body || {};
  const name = str(req.body?.name);
  const email = str(req.body?.email).toLowerCase();
  const vehicle = str(req.body?.vehicle);
  const plate = str(req.body?.plate);

  if (!name || !EMAIL.test(email) || typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ error: 'Name, a valid email and a 6+ character password are required' });
  if (!['rider', 'driver'].includes(role))
    return res.status(400).json({ error: 'Role must be rider or driver' });
  if (role === 'driver' && (!vehicle || !plate))
    return res.status(400).json({ error: 'Drivers need a vehicle and plate number' });

  try {
    const hash = await bcrypt.hash(password, 10);
    // One transaction: a driver account is never left half-created.
    const user = await tx(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role',
        [name, email, hash, role]
      );
      if (role === 'driver')
        await db.query('INSERT INTO drivers (user_id,vehicle,plate) VALUES ($1,$2,$3)', [rows[0].id, vehicle, plate]);
      return rows[0];
    });
    res.json({ token: sign(user), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    throw e;
  }
}));

authRouter.post('/login', wrap(async (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = await q('SELECT * FROM users WHERE email=$1', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

authRouter.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.name, u.email, u.role, d.vehicle, d.plate, d.is_online,
       (SELECT ROUND(AVG(stars),2) FROM ratings WHERE to_user = u.id) AS rating
     FROM users u LEFT JOIN drivers d ON d.user_id = u.id WHERE u.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Account not found' });
  res.json(rows[0]);
}));
