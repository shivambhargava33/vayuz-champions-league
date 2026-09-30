'use client';
import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client';

const AuthCtx = createContext({ role: null, authed: false, isAdmin: false });
export const useAuth = () => useContext(AuthCtx);

export default function Shell({ children }) {
  const [role, setRole] = useState(null);
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/auth').then((d) => setRole(d.role)).catch(() => {}); }, []);

  async function login(e) {
    e.preventDefault();
    try {
      const d = await api('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
      setRole(d.role); setAsking(false); setPin(''); setErr('');
    } catch (e2) { setErr(e2.message); }
  }
  async function logout() { await api('/api/auth', { method: 'DELETE' }); setRole(null); }

  return (
    <AuthCtx.Provider value={{ role, authed: !!role, isAdmin: role === 'admin' }}>
      <header className="nav">
        <Link href="/" className="brand">🏏 VAYUZ Champions League - Convergence 11.0</Link>
        <nav>
          <Link href="/">Matches</Link>
          <Link href="/leaderboard">Table</Link>
          <Link href="/teams">Teams</Link>
          {role
            ? <button className="link" onClick={logout}>{role === 'admin' ? 'Admin' : 'Umpire'} · Logout</button>
            : <button className="link" onClick={() => setAsking(true)}>Login</button>}
        </nav>
      </header>
      <main className="wrap">{children}</main>
      {asking && (
        <div className="modal-bg" onClick={() => setAsking(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={login}>
            <h3>Admin / Umpire login</h3>
            <p className="muted">Enter your PIN. Umpires can score matches; admins can also manage teams and players.</p>
            <input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
            {err && <p className="error">{err}</p>}
            <button className="btn primary" type="submit">Unlock</button>
          </form>
        </div>
      )}
    </AuthCtx.Provider>
  );
}
