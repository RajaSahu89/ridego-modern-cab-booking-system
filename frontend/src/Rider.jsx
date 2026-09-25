import { useEffect, useState } from 'react';
import { api, connectSocket } from './api';
import MapView from './MapView';
import { Rate } from './History';

const LIVE = ['requested', 'accepted', 'started'];

// Car icons for different vehicle types
const VEHICLE_ICONS = {
  'sedan': '🚗',
  'suv': '🚙',
  'bike': '🏍️',
  'auto': '🚐',
  'luxury': '🚘',
  'default': '🚗'
};

const getCarIcon = (vehicleType) => {
  const lower = vehicleType?.toLowerCase() || '';
  return VEHICLE_ICONS[lower] || VEHICLE_ICONS.default;
};

export default function Rider() {
  const [pickup, setPickup] = useState(null);
  const [drop, setDrop] = useState(null);
  const [est, setEst] = useState(null);
  const [ride, setRide] = useState(null);
  const [car, setCar] = useState(null);
  const [err, setErr] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api('/rides/active').then(setRide).catch(() => {});
    const s = connectSocket();
    s.on('ride:update', setRide);
    s.on('driver:location', (p) => setCar({ lat: p.lat, lng: p.lng }));
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (pickup && drop) api('/rides/estimate', 'POST', { pickup, drop }).then(setEst).catch((e) => setErr(e.message));
    else setEst(null);
  }, [pickup, drop]);

  const busy = ride && LIVE.includes(ride.status);
  const pick = (p) => { if (!busy) (pickup ? setDrop : setPickup)(p); };
  const reset = () => { 
    setRide(null); 
    setPickup(null); 
    setDrop(null); 
    setEst(null); 
    setCar(null); 
    setErr('');
    setCancelling(false);
  };

  const request = async () => {
    setErr('');
    try { 
      setRide(await api('/rides', 'POST', { pickup, drop })); 
      setCar(null); 
    }
    catch (e) { 
      setErr(e.message); 
    }
  };

  const cancel = async () => {
    setCancelling(true);
    setErr('');
    try {
      await api(`/rides/${ride.id}/cancel`, 'POST');
      // Wait for websocket update or fallback
      setTimeout(() => reset(), 500);
    } catch (e) { 
      setErr(e.message);
      setCancelling(false);
    }
  };

  const from = ride ? { lat: ride.pickup_lat, lng: ride.pickup_lng } : pickup;
  const to = ride ? { lat: ride.drop_lat, lng: ride.drop_lng } : drop;
  const carPos = car || (ride?.driver_lat != null ? { lat: ride.driver_lat, lng: ride.driver_lng } : null);
  const rating = ride?.driver_rating ? ` ★ ${Number(ride.driver_rating).toFixed(1)}` : '';
  const carIcon = getCarIcon(ride?.vehicle);

  return (
    <div className="layout">
      <aside className="panel">
        {!ride && (
          <>
            <h2>📍 Where to?</h2>
            <p className="muted">
              {!pickup ? '✓ Tap the map to set your pickup point' : !drop ? '✓ Now tap your drop-off point' : '✓ Ready to book!'}
            </p>
            
            {est && (
              <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="fare">₹{est.fare.toFixed(0)}</span>
                  <span className="muted">{est.distance_km} km • {est.duration_min} min</span>
                </div>
              </div>
            )}
            
            <div style={{ marginTop: '8px' }}>
              <button 
                disabled={!est} 
                onClick={request}
                style={{ width: '100%', marginBottom: '8px' }}
              >
                ✓ Request Ride
              </button>
              {pickup && (
                <button 
                  className="ghost" 
                  onClick={reset}
                  style={{ width: '100%' }}
                >
                  🔄 Clear Points
                </button>
              )}
            </div>
          </>
        )}

        {ride?.status === 'requested' && (
          <div className="status-message waiting">
            <p style={{ margin: 0 }}>⏳ <strong>Finding a driver near you…</strong></p>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem' }}>This should take a moment</p>
          </div>
        )}

        {ride?.status === 'accepted' && (
          <>
            <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '2rem' }}>{carIcon}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block' }}>{ride.driver_name}{rating}</strong>
                  <span className="muted">{ride.vehicle} • {ride.plate}</span>
                </div>
              </div>
              <div style={{ 
                marginTop: '8px', 
                padding: '8px', 
                background: 'var(--green-light)', 
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: '600',
                textAlign: 'center'
              }}>
                ✓ Driver is on the way
              </div>
            </div>
          </>
        )}

        {ride?.status === 'started' && (
          <div className="status-message progress">
            <p style={{ margin: 0 }}><strong>🚗 Trip in progress</strong></p>
            <p style={{ margin: '8px 0 0 0', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--green)' }}>
              ₹{Number(ride.fare).toFixed(0)}
            </p>
          </div>
        )}

        {ride && ['requested', 'accepted'].includes(ride.status) && (
          <button 
            className="danger" 
            onClick={cancel}
            disabled={cancelling}
            style={{ width: '100%' }}
          >
            {cancelling ? '⏳ Cancelling…' : '✕ Cancel Ride'}
          </button>
        )}

        {ride?.status === 'completed' && (
          <>
            <div className="card" style={{ 
              background: 'var(--green-light)',
              borderLeft: '4px solid var(--green)',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2rem' }}>✓</span>
              <strong style={{ display: 'block', marginTop: '8px' }}>
                Trip Complete!
              </strong>
              <span className="muted" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--green)' }}>
                ₹{Number(ride.fare).toFixed(0)}
              </span>
            </div>
            <p className="muted" style={{ textAlign: 'center' }}>How was your ride with {ride.driver_name}?</p>
            <Rate rideId={ride.id} onDone={reset} />
            <button className="ghost" onClick={reset} style={{ width: '100%' }}>
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
              onClick={reset}
              style={{ width: '100%' }}
            >
              📍 Book Another Ride
            </button>
          </div>
        )}

        {err && <div className="err">⚠️ {err}</div>}
      </aside>
      
      <MapView
        onPick={pick}
        fly={pickup}
        markers={[
          { key: 'pickup', pos: from, label: '📍 Pickup' }, 
          { key: 'drop', pos: to, label: '📌 Dropoff' }, 
          { key: 'car', pos: carPos, label: `${carIcon} Driver` }
        ]}
      />
    </div>
  );
}
