import { useEffect, useRef, useState } from 'react';
import { api, connectSocket } from './api';
import MapView from './MapView';
import { Rate } from './History';

export default function Driver({ me }) {
  const [online, setOnline] = useState(false);
  const [pos, setPos] = useState(null);
  const [flyTo, setFlyTo] = useState(null);
  const [ride, setRide] = useState(null);
  const [requests, setRequests] = useState([]);
  const [err, setErr] = useState('');
  const [accepting, setAccepting] = useState(null);
  const sock = useRef(null);
  const watch = useRef(null);

  const report = (p) => {
    setPos(p);
    setFlyTo((f) => f || p);
    sock.current?.emit('driver:location', p);
  };

  useEffect(() => {
    api('/rides/active').then(setRide).catch(() => {});
    const s = (sock.current = connectSocket());
    s.on('ride:new', (r) => setRequests((l) => [r, ...l.filter((x) => x.id !== r.id)]));
    s.on('ride:update', (r) => { setRide(r); setRequests((l) => l.filter((x) => x.id !== r.id)); });
    return () => { s.disconnect(); if (watch.current != null) navigator.geolocation?.clearWatch(watch.current); };
  }, []);

  // Pick up requests that were made before this driver came online
  useEffect(() => {
    if (!online || !pos || ride) return;
    const t = setTimeout(() => api('/rides/pending').then(setRequests).catch(() => {}), 800);
    return () => clearTimeout(t);
  }, [online, !!pos]);

  const toggle = () => {
    const next = !online;
    setOnline(next);
    sock.current.emit('driver:online', next);
    if (next) {
      watch.current = navigator.geolocation?.watchPosition(
        (g) => report({ lat: g.coords.latitude, lng: g.coords.longitude }),
        () => setErr('📍 Location is blocked. Tap the map to set your position instead.'),
        { enableHighAccuracy: true }
      );
    } else {
      if (watch.current != null) navigator.geolocation?.clearWatch(watch.current);
      setRequests([]);
    }
  };

  const accept = async (r) => {
    setAccepting(r.id);
    setErr('');
    try { 
      setRide(await api(`/rides/${r.id}/accept`, 'POST')); 
      setRequests([]); 
    }
    catch (e) { 
      setErr(e.message); 
      setRequests((l) => l.filter((x) => x.id !== r.id));
      setAccepting(null);
    }
  };

  const act = (action) => api(`/rides/${ride.id}/${action}`, 'POST').then(setRide).catch((e) => setErr(e.message));

  const live = ride && ['accepted', 'started'].includes(ride.status);
  const from = ride ? { lat: ride.pickup_lat, lng: ride.pickup_lng } : null;
  const to = ride ? { lat: ride.drop_lat, lng: ride.drop_lng } : null;

  return (
    <div className="layout">
      <aside className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '1.8rem' }}>🚗</span>
          <div>
            <h2 style={{ marginBottom: '4px' }}>{me.vehicle}</h2>
            <span className="muted">{me.plate}</span>
          </div>
        </div>

        {!live && ride?.status !== 'completed' && ride?.status !== 'cancelled' && (
          <>
            <button 
              className={online ? 'danger' : ''} 
              onClick={toggle}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              {online ? '🔴 Go Offline' : '🟢 Go Online'}
            </button>

            {online && !pos && (
              <div className="status-message waiting">
                <p style={{ margin: 0 }}>📍 <strong>Waiting for location…</strong></p>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem' }}>Allow access or tap the map to set it</p>
              </div>
            )}

            {online && pos && !requests.length && (
              <div className="status-message">
                <p style={{ margin: 0 }}>✓ <strong>Online & Ready</strong></p>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem' }}>Waiting for ride requests…</p>
              </div>
            )}

            {requests.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ 
                  padding: '8px 12px',
                  background: 'var(--amber-light)',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  fontSize: '0.9rem',
                  fontWeight: '600'
                }}>
                  🔔 {requests.length} request{requests.length > 1 ? 's' : ''} available
                </div>
                {requests.map((r) => (
                  <div className="card" key={r.id} style={{ borderLeft: '4px solid var(--amber)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>
                          📍 {r.pickup_km} km away
                        </strong>
                        <span className="fare">₹{Number(r.fare).toFixed(0)}</span>
                      </div>
                      <span className="muted" style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                        {Number(r.distance_km).toFixed(1)} km<br/>trip
                      </span>
                    </div>
                    <span className="muted" style={{ display: 'block', marginTop: '8px' }}>
                      👤 {r.rider_name}
                    </span>
                    <button 
                      onClick={() => accept(r)}
                      disabled={accepting === r.id}
                      style={{ width: '100%', marginTop: '10px' }}
                    >
                      {accepting === r.id ? '⏳ Accepting…' : '✓ Accept'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {ride?.status === 'accepted' && (
          <>
            <div className="card" style={{ 
              background: 'var(--green-light)',
              borderLeft: '4px solid var(--green)',
              marginBottom: '12px'
            }}>
              <p style={{ margin: 0, fontWeight: '600' }}>
                ✓ Ride Accepted
              </p>
              <strong style={{ display: 'block', marginTop: '8px', fontSize: '1.1rem' }}>
                👤 {ride.rider_name}
              </strong>
            </div>
            
            <p className="muted" style={{ marginBottom: '12px' }}>
              📍 Head to pickup location
            </p>
            
            <button 
              onClick={() => act('start')}
              style={{ width: '100%', marginBottom: '8px' }}
            >
              ✓ Start Trip
            </button>
            <button 
              className="danger" 
              onClick={() => act('cancel')}
              style={{ width: '100%' }}
            >
              ✕ Cancel Ride
            </button>
          </>
        )}

        {ride?.status === 'started' && (
          <>
            <div className="status-message progress" style={{ marginBottom: '12px' }}>
              <p style={{ margin: 0 }}><strong>🚗 Trip in Progress</strong></p>
              <p style={{ margin: '8px 0 0 0', fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--green)' }}>
                ₹{Number(ride.fare).toFixed(0)}
              </p>
            </div>
            
            <button 
              onClick={() => act('complete')}
              style={{ width: '100%' }}
            >
              ✓ Complete Trip
            </button>
          </>
        )}

        {ride?.status === 'completed' && (
          <>
            <div className="card" style={{ 
              background: 'var(--green-light)',
              borderLeft: '4px solid var(--green)',
              textAlign: 'center',
              marginBottom: '12px'
            }}>
              <span style={{ fontSize: '2rem' }}>✓</span>
              <strong style={{ display: 'block', marginTop: '8px' }}>Trip Completed</strong>
              <span className="muted" style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--green)' }}>
                Collect ₹{Number(ride.fare).toFixed(0)}
              </span>
            </div>

            <p className="muted" style={{ textAlign: 'center', marginBottom: '12px' }}>
              How was {ride.rider_name}?
            </p>
            <Rate rideId={ride.id} onDone={() => setRide(null)} />
            <button 
              className="ghost" 
              onClick={() => setRide(null)}
              style={{ width: '100%' }}
            >
              Skip Rating
            </button>
          </>
        )}

        {ride?.status === 'cancelled' && (
          <div className="card" style={{ 
            background: 'var(--red-light)',
            borderLeft: '4px solid var(--red)',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '2rem' }}>✕</span>
            <p><strong>Ride Cancelled</strong></p>
            <button 
              onClick={() => setRide(null)}
              style={{ width: '100%' }}
            >
              Back to Requests
            </button>
          </div>
        )}

        {err && <div className="err">⚠️ {err}</div>}
      </aside>

      <MapView
        onPick={online ? report : undefined}
        fly={flyTo}
        markers={[
          { key: 'pickup', pos: from, label: '📍 Pickup' }, 
          { key: 'drop', pos: to, label: '📌 Dropoff' }, 
          { key: 'car', pos, label: '🚗 You' }
        ]}
      />
    </div>
  );
}
