# RideGo: an Uber/Ola-style ride platform

Rider and driver accounts, nearest-driver matching, live driver location on a map, fare calculation, trip history and two-way ratings.

**Stack:** React + Vite + Leaflet (OpenStreetMap) | Node + Express + Socket.IO | PostgreSQL

## How it works

| Feature | Where |
|---|---|
| Accounts (rider/driver, JWT, bcrypt) | `backend/src/auth.js` |
| Matching: nearest 3 free online drivers within 10 km get the request; first to accept wins (atomic `UPDATE ... WHERE status='requested'`) | `backend/src/rides.js` |
| Live location: driver's browser emits `driver:location`, server saves the latest point and forwards it to the rider | `backend/src/index.js` |
| Fare: base + distance + time, with a minimum | `backend/src/util.js` |
| Ride lifecycle: requested, accepted, started, completed / cancelled | `backend/src/rides.js` |
| Ratings (1-5, once per person per ride) and trip history | `rides.js`, `frontend/src/History.jsx` |

## Run locally

Needs Node 18.18+ and a PostgreSQL database (installed on your PC, or a free Supabase/Neon one).

```bash
npm run install:all   # installs everything and creates backend/.env and frontend/.env
# open backend/.env and set DATABASE_URL (instructions are inside the file)
npm run db:setup      # creates the database (if missing) and all tables
npm run dev           # backend on :4000 + frontend on http://localhost:5173
```

`npm run db:setup` is safe to repeat. No `psql` needed. On a hosted database you can skip creating anything by hand: it just creates the tables.

**Try it alone:** register a rider in one browser and a driver in another (or a private window). As the driver, tap "Go online" and tap the map to set your position. As the rider, tap pickup and drop-off, then "Request ride".

### If sign-up says "Server error" or something similar

The backend terminal (the `api` lines) prints the real reason. Common ones:

| Message | Fix |
|---|---|
| Database tables are missing | Run `npm run db:setup` |
| Cannot connect to the database | Check `DATABASE_URL` in `backend/.env`; make sure PostgreSQL is running; restart `npm run dev` after editing `.env` |
| `password authentication failed` | Wrong password in `DATABASE_URL` |
| `The server does not support SSL` | Handled automatically now. To force it, add `DATABASE_SSL=false` to `backend/.env` |
| Supabase `ENOTFOUND` / `ENETUNREACH` | Use Supabase's "Session pooler" connection string instead of the direct one |
| Browser says "Cannot reach the server" | The backend isn't running, or `VITE_API_URL` in `frontend/.env` is wrong |

## Deploy for free

1. **Database:** Supabase (or Neon). Copy its connection string into `DATABASE_URL`, then create the tables with `npm run db:setup` (or paste `backend/schema.sql` into its SQL editor).
2. **Backend:** Render web service (root `backend`, build `npm install`, start `npm start`). Set `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL` (your frontend URL).
3. **Frontend:** Vercel or Netlify (root `frontend`, build `npm run build`, output `dist`). Set `VITE_API_URL` to your Render URL.

Free tiers change and often sleep idle services, so the first request after a break can be slow. Check each provider's pricing page.

## Ideas to extend

Surge pricing, PostGIS for geo queries, ride-type tiers (bike/auto/cab), payments, driver earnings dashboard, route lines via OSRM, tests.
