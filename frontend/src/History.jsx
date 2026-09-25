import { useEffect, useState } from 'react';
import { api } from './api';

const STATUS_ICONS = {
  'completed': { icon: '✓', color: 'var(--green)', label: 'Completed' },
  'cancelled': { icon: '✕', color: 'var(--red)', label: 'Cancelled' },
  'requested': { icon: '🔄', color: 'var(--amber)', label: 'Requested' },
  'accepted': { icon: '✓', color: 'var(--green)', label: 'Accepted' },
  'started': { icon: '🚗', color: 'var(--green)', label: 'In Progress' },
};

export function Rate({ rideId, onDone }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const send = async () => {
    setSubmitting(true);
    try { 
      await api(`/rides/${rideId}/rate`, 'POST', { stars, comment }); 
      onDone(); 
    }
    catch (e) { 
      setErr(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '12px' }}>
      <div className="tabs">
        {[1, 2, 3, 4, 5].map((n) => (
          <button 
            key={n} 
            className={n <= stars ? '' : 'ghost'} 
            onClick={() => setStars(n)}
            aria-label={`${n} stars`}
          >
            ★
          </button>
        ))}
      </div>
      <input 
        placeholder="Add a comment (optional)" 
        value={comment} 
        onChange={(e) => setComment(e.target.value)}
        disabled={submitting}
      />
      {err && <div className="err">⚠️ {err}</div>}
      <button 
        onClick={send}
        disabled={submitting}
        style={{ width: '100%' }}
      >
        {submitting ? '⏳ Submitting…' : '✓ Submit Rating'}
      </button>
    </div>
  );
}

export default function History() {
  const [rides, setRides] = useState(null);
  
  const load = () => api('/rides/history').then(setRides).catch(() => setRides([]));
  
  useEffect(() => { load(); }, []);

  if (!rides) return (
    <div className="history" style={{ textAlign: 'center', paddingTop: '40px' }}>
      <p className="muted">⏳ Loading trips…</p>
    </div>
  );

  if (!rides.length) return (
    <div className="history" style={{ textAlign: 'center', paddingTop: '40px' }}>
      <span style={{ fontSize: '3rem', marginBottom: '16px', display: 'block' }}>📋</span>
      <p><strong>No trips yet</strong></p>
      <p className="muted">Book or accept a ride and it will show up here</p>
    </div>
  );

  return (
    <div className="history">
      <h2 style={{ marginBottom: '16px' }}>📋 Trip History</h2>
      {rides.map((r) => {
        const status = STATUS_ICONS[r.status] || STATUS_ICONS.requested;
        const date = new Date(r.requested_at);
        
        return (
          <div 
            className="card" 
            key={r.id}
            style={{
              borderLeft: `4px solid ${status.color}`,
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '4px' }}>
                  {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </strong>
                <span className="fare">₹{Number(r.fare).toFixed(0)}</span>
              </div>
              <span style={{ 
                background: status.color,
                color: '#fff',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}>
                {status.icon} {status.label}
              </span>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '16px',
              padding: '10px 0',
              borderTop: '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
              margin: '10px 0'
            }}>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Distance</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: '600' }}>
                  {Number(r.distance_km).toFixed(1)} km
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>People</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                  👤 {r.rider_name}
                  {r.driver_name && <><br />🚗 {r.driver_name}</>}
                </p>
              </div>
            </div>

            {r.status === 'completed' && (
              <>
                {r.my_rating ? (
                  <div style={{ 
                    padding: '10px', 
                    background: 'var(--green-light)',
                    borderRadius: '8px',
                    textAlign: 'center',
                    marginTop: '10px'
                  }}>
                    <span style={{ fontSize: '0.9rem' }}>
                      ⭐ You rated this trip <strong>{r.my_rating}</strong>
                    </span>
                  </div>
                ) : (
                  <Rate rideId={r.id} onDone={load} />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
