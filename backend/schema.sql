CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rider','driver')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle TEXT NOT NULL,
  plate TEXT NOT NULL,
  is_online BOOLEAN DEFAULT false,
  lat DOUBLE PRECISION, 
  lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rides (
  id SERIAL PRIMARY KEY,
  rider_id INT NOT NULL REFERENCES users(id),
  driver_id INT REFERENCES users(id),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lng DOUBLE PRECISION NOT NULL,
  distance_km NUMERIC(8,2) NOT NULL,
  fare NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','accepted','started','completed','cancelled')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rides_rider_idx ON rides(rider_id);
CREATE INDEX IF NOT EXISTS rides_driver_idx ON rides(driver_id);
CREATE INDEX IF NOT EXISTS rides_status_idx ON rides(status);

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  ride_id INT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  from_user INT NOT NULL REFERENCES users(id),
  to_user INT NOT NULL REFERENCES users(id),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  UNIQUE (ride_id, from_user)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
