'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { computeStandings } from '@/lib/standings';

const fmt = (n) => (n > 0 ? '+' : '') + n.toFixed(3);

function Table({ title, rows }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <table className="lb">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i < 2 ? 'top' : ''}>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.lost}{r.tied ? `+${r.tied}T` : ''}</td>
              <td><b>{r.points}</b></td>
              <td className={r.nrr < 0 ? 'neg' : ''}>{r.played ? fmt(r.nrr) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api('/api/state').then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const groups = [...new Set(data.teams.map((t) => t.group_name).filter(Boolean))].sort();
  const forGroup = (g) => {
    const ts = data.teams.filter((t) => t.group_name === g);
    const ms = data.matches.filter((m) => ts.some((t) => t.id === m.team_a));
    return computeStandings(ts, data.players, ms, data.balls);
  };

  return (
    <>
      <h2>Leaderboard</h2>
      {groups.map((g) => <Table key={g} title={`Group ${g}`} rows={forGroup(g)} />)}
      <p className="muted small">Win = 2 pts, loss = 0 (a tie = 1 each). Ranked by points, then net run rate. Top 2 in each group (highlighted) reach the semifinals. Only finished group matches count; a side that is bowled out is charged its full overs quota.</p>
    </>
  );
}
