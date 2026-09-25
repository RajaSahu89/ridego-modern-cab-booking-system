import express from 'express';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { wrap, haversine, estimate } from './util.js';

const RADIUS_KM = 10;
const ACTIVE = "('requested','accepted','started')";

const RIDE_SQL = `
  SELECT r.*, rd.name AS rider_name, dr.name AS driver_name,
         d.vehicle, d.plate, d.lat AS driver_lat, d.lng AS driver_lng,
         (SELECT ROUND(AVG(stars),2) FROM ratings WHERE to_user = r.driver_id) AS driver_rating
  FROM rides r
  JOIN users rd ON rd.id = r.rider_id
  LEFT JOIN users dr ON dr.id = r.driver_id
  LEFT JOIN drivers d ON d.user_id = r.driver_id`;

const getRide = async (id) => (await q(`${RIDE_SQL} WHERE r.id = $1`, [id])).rows[0];
const validPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export default function ridesRouter(io) {
  const r = express.Router();
  r.use(requireAuth);

  const only = (role) => (req, res, next) =>
    req.user.role === role ? next() : res.status(403).json({ error: `Only ${role}s can do this` });

  const push = (ride) => {
    io.to(`user:${ride.rider_id}`).emit('ride:update', ride);
    if (ride.driver_id) io.to(`user:${ride.driver_id}`).emit('ride:update', ride);
  };

  // Fare preview before booking
  r.post('/estimate', wrap(async (req, res) => {
    const { pickup, drop } = req.body;
    if (!validPoint(pickup) || !validPoint(drop))
      return res.status(400).json({ error: 'Pickup and drop-off are required' });
    res.json(estimate(pickup, drop));
  }));

  // Rider books a ride -> match the nearest free online drivers
  r.post('/', only('rider'), wrap(async (req, res) => {
    const { pickup, drop } = req.body;
    if (!validPoint(pickup) || !validPoint(drop))
      return res.status(400).json({ error: 'Pickup and drop-off are required' });

    const open = await q(`SELECT 1 FROM rides WHERE rider_id=$1 AND status IN ${ACTIVE}`, [req.user.id]);
    if (open.rowCount) return res.status(409).json({ error: 'You already have an active ride' });

    const e = estimate(pickup, drop);
    const ins = await q(
      `INSERT INTO rides (rider_id,pickup_lat,pickup_lng,drop_lat,drop_lng,distance_km,fare)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, pickup.lat, pickup.lng, drop.lat, drop.lng, e.distance_km, e.fare]
    );
    const ride = await getRide(ins.rows[0].id);

    const { rows: drivers } = await q(
      `SELECT user_id, lat, lng FROM drivers d
       WHERE is_online AND lat IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM rides WHERE driver_id = d.user_id AND status IN ('accepted','started'))`
    );
    drivers
      .map((d) => ({ id: d.user_id, km: haversine(pickup, d) }))
      .filter((d) => d.km <= RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 3)
      .forEach((d) => io.to(`user:${d.id}`).emit('ride:new', { ...ride, pickup_km: +d.km.toFixed(1) }));

    res.json(ride);
  }));

  r.get('/active', wrap(async (req, res) => {
    const col = req.user.role === 'driver' ? 'driver_id' : 'rider_id';
    const { rows } = await q(
      `${RIDE_SQL} WHERE r.${col} = $1 AND r.status IN ${ACTIVE} ORDER BY r.id DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  }));

  // Requests already waiting near a driver who just went online
  r.get('/pending', only('driver'), wrap(async (req, res) => {
    const { rows: [d] } = await q('SELECT lat, lng FROM drivers WHERE user_id=$1', [req.user.id]);
    if (!d || d.lat == null) return res.json([]);
    const { rows } = await q(`${RIDE_SQL} WHERE r.status = 'requested'`);
    res.json(
      rows
        .map((x) => ({ ...x, pickup_km: +haversine(d, { lat: x.pickup_lat, lng: x.pickup_lng }).toFixed(1) }))
        .filter((x) => x.pickup_km <= RADIUS_KM)
    );
  }));

  r.get('/history', wrap(async (req, res) => {
    const { rows } = await q(
      `${RIDE_SQL} WHERE r.rider_id = $1 OR r.driver_id = $1 ORDER BY r.id DESC LIMIT 100`,
      [req.user.id]
    );
    const mine = await q('SELECT ride_id, stars FROM ratings WHERE from_user = $1', [req.user.id]);
    const byRide = Object.fromEntries(mine.rows.map((m) => [m.ride_id, m.stars]));
    res.json(rows.map((x) => ({ ...x, my_rating: byRide[x.id] || null })));
  }));

  // Atomic accept: only one driver can flip 'requested' -> 'accepted'
  r.post('/:id/accept', only('driver'), wrap(async (req, res) => {
    const busy = await q("SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','started')", [req.user.id]);
    if (busy.rowCount) return res.status(409).json({ error: 'Finish your current ride first' });
    const upd = await q(
      "UPDATE rides SET driver_id=$1, status='accepted' WHERE id=$2 AND status='requested' RETURNING id",
      [req.user.id, req.params.id]
    );
    if (!upd.rowCount) return res.status(409).json({ error: 'That ride was already taken or cancelled' });
    const ride = await getRide(upd.rows[0].id);
    push(ride);
    res.json(ride);
  }));

  // `from`, `to` and `extra` are fixed strings below, never user input.
  const transition = (from, to, extra = '') =>
    wrap(async (req, res) => {
      const upd = await q(
        `UPDATE rides SET status='${to}' ${extra} WHERE id=$1 AND driver_id=$2 AND status='${from}' RETURNING id`,
        [req.params.id, req.user.id]
      );
      if (!upd.rowCount) return res.status(409).json({ error: `Ride is not ${from}` });
      const ride = await getRide(upd.rows[0].id);
      push(ride);
      res.json(ride);
    });

  r.post('/:id/start', only('driver'), transition('accepted', 'started', ', started_at = now()'));
  r.post('/:id/complete', only('driver'), transition('started', 'completed', ', completed_at = now()'));

  r.post('/:id/cancel', wrap(async (req, res) => {
    const upd = await q(
      `UPDATE rides SET status='cancelled'
       WHERE id=$1 AND (rider_id=$2 OR driver_id=$2) AND status IN ('requested','accepted') RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!upd.rowCount) return res.status(409).json({ error: 'This ride can no longer be cancelled' });
    const ride = await getRide(upd.rows[0].id);
    push(ride);
    res.json(ride);
  }));

  r.post('/:id/rate', wrap(async (req, res) => {
    const stars = Number(req.body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5)
      return res.status(400).json({ error: 'Rating must be 1 to 5 stars' });
    const ride = await getRide(req.params.id);
    if (!ride || ride.status !== 'completed')
      return res.status(400).json({ error: 'Only completed rides can be rated' });
    const me = req.user.id;
    if (me !== ride.rider_id && me !== ride.driver_id)
      return res.status(403).json({ error: 'Not your ride' });
    const to = me === ride.rider_id ? ride.driver_id : ride.rider_id;
    try {
      await q('INSERT INTO ratings (ride_id,from_user,to_user,stars,comment) VALUES ($1,$2,$3,$4,$5)', [
        ride.id, me, to, stars, String(req.body.comment || '').slice(0, 300),
      ]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'You already rated this ride' });
      throw e;
    }
    res.json({ ok: true });
  }));

  return r;
}
