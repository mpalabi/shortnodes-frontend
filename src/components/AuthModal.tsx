import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AuthModal({ open, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  async function login() {
    try {
      setLoading(true);
      setError(null);
      // Replace with your real endpoint when ready
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'Login failed');
      }
      const data = await res.json().catch(() => ({}));
      // Example: store JWT if returned
      if (data.token) localStorage.setItem('auth_token', data.token);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ width: 360, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Sign in</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
          <button className="button" onClick={login} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}


