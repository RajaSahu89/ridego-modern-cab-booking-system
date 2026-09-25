export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const haversine = (a, b) => {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const BASE = 30, PER_KM = 12, PER_MIN = 1.5, MIN_FARE = 50;
const ROAD_FACTOR = 1.3;
const AVG_KMH = 30;

export const estimate = (a, b) => {
  const km = haversine(a, b) * ROAD_FACTOR;
  const min = (km / AVG_KMH) * 60;
  const fare = Math.max(MIN_FARE, BASE + km * PER_KM + min * PER_MIN);
  return { distance_km: +km.toFixed(2), duration_min: Math.round(min), fare: +fare.toFixed(2) };
};
