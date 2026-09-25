import { io } from 'socket.io-client';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const session = {
  get token() { return localStorage.getItem('token'); },
  save: (t) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`Cannot reach the server at ${API}. Is the backend running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const connectSocket = () => io(API, { auth: { token: session.token } });
