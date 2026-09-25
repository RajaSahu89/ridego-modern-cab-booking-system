import { useEffect, useState } from 'react';
import { api, session } from './api';
import Rider from './Rider.jsx';
import Driver from './Driver.jsx';
import History from './History.jsx';
import './styles.css';

function Auth({ onDone, theme, toggleTheme }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ role: 'rider' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const d = await api(mode === 'login' ? '/auth/login' : '/auth/register', 'POST', f);
      session.save(d.token);
      onDone();
    } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <button 
        className="theme-toggle" 
        onClick={toggleTheme}
        style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 100 }}
        title="Toggle dark mode"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <form className="auth" onSubmit={submit}>
        <h1>🚗 RideGo</h1>
        {mode === 'register' && (
          <>
            <input placeholder="Full name" onChange={set('name')} required />
            <select value={f.role} onChange={set('role')}>
              <option value="rider">I need rides</option>
              <option value="driver">I drive</option>
            </select>
            {f.role === 'driver' && (
              <>
                <input placeholder="Vehicle (e.g. White Swift)" onChange={set('vehicle')} required />
                <input placeholder="Plate number" onChange={set('plate')} required />
              </>
            )}
          </>
        )}
        <input type="email" placeholder="Email" onChange={set('email')} required />
        <input type="password" placeholder="Password (6+ characters)" onChange={set('password')} required />
        {err && <div className="err">⚠️ {err}</div>}
        <button>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in'}
        </button>
      </form>
    </>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('trip');
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const load = () =>
    api('/auth/me')
      .then(setMe)
      .catch((e) => { if (e.status === 401) session.clear(); setMe(null); })
      .finally(() => setReady(true));
  
  useEffect(() => { session.token ? load() : setReady(true); }, []);

  if (!ready) return null;
  if (!me) return <Auth onDone={load} theme={theme} toggleTheme={toggleTheme} />;

  const logout = () => { session.clear(); setMe(null); setTab('trip'); };
  const rating = me.rating ? ` ★ ${Number(me.rating).toFixed(1)}` : '';

  return (
    <>
      <header className="bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.3rem' }}>🚗</span>
          <strong>{me.name} ({me.role}{rating})</strong>
        </div>
        <nav>
          <button className={tab === 'trip' ? 'on' : ''} onClick={() => setTab('trip')}>
            {me.role === 'rider' ? '📍 Book Ride' : '🎯 Drive'}
          </button>
          <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
            📋 History
          </button>
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title="Toggle dark mode"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={logout}>Logout</button>
        </nav>
      </header>
      {tab === 'history' ? <History /> : me.role === 'rider' ? <Rider /> : <Driver me={me} />}
    </>
  );
}
