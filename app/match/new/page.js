'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, write } from '@/lib/client';
import { useAuth } from '@/components/Shell';

export default function NewMatch() {
  const { authed } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [f, setF] = useState({ team_a: '', team_b: '', batting_first: '', overs: 6, players_per_side: 6 });
  const [error, setError] = useState('');
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));

  useEffect(() => { api('/api/state').then(setData).catch((e) => setError(e.message)); }, []);
  if (!data) return <p className="muted">{error || 'Loading…'}</p>;
  if (!authed) return <p className="muted">Log in as umpire or admin (top right) to start a match.</p>;

  const size = (id) => data.players.filter((p) => p.team_id === id).length;
  const teamA = data.teams.find((t) => t.id === f.team_a), teamB = data.teams.find((t) => t.id === f.team_b);

  async function submit(e) {
    e.preventDefault(); setError('');
    try {
      const { id } = await write({ action: 'createMatch', ...f });
      router.push(`/match/${id}`);
    } catch (e2) { setError(e2.message); }
  }

  return (
    <form onSubmit={submit} className="card stack">
      <h2>New match</h2>
      <label>Team A
        <select value={f.team_a} onChange={(e) => set('team_a', e.target.value)}>
          <option value="">Select…</option>
          {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({size(t.id)} players)</option>)}
        </select>
      </label>
      <label>Team B
        <select value={f.team_b} onChange={(e) => set('team_b', e.target.value)}>
          <option value="">Select…</option>
          {data.teams.filter((t) => t.id !== f.team_a).map((t) => <option key={t.id} value={t.id}>{t.name} ({size(t.id)} players)</option>)}
        </select>
      </label>
      <label>Who bats first (after toss)?
        <select value={f.batting_first} onChange={(e) => set('batting_first', e.target.value)}>
          <option value="">Select…</option>
          {teamA && <option value={teamA.id}>{teamA.name}</option>}
          {teamB && <option value={teamB.id}>{teamB.name}</option>}
        </select>
      </label>
      <div className="row">
        <label className="grow">Overs per innings
          <input type="number" min="1" max="50" value={f.overs} onChange={(e) => set('overs', e.target.value)} />
        </label>
        <label className="grow">Players per side
          <input type="number" min="2" max="15" value={f.players_per_side} onChange={(e) => set('players_per_side', e.target.value)} />
        </label>
      </div>
      <p className="muted small">Each over has 3 balls. An innings ends when all but one player are out, overs are done, or the target is chased.</p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={!f.team_a || !f.team_b || !f.batting_first}>Start match</button>
    </form>
  );
}
