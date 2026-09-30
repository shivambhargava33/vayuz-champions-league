'use client';
import { useEffect, useState } from 'react';
import { api, write } from '@/lib/client';
import { useAuth } from '@/components/Shell';

export default function Teams() {
  const { isAdmin: authed } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [names, setNames] = useState({}); // team id -> text of players being added

  const load = () => api('/api/state').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (body) => {
    setError('');
    try { await write(body); await load(); } catch (e) { setError(e.message); }
  };

  if (!data) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <>
      <h2>Teams &amp; Players</h2>
      {error && <p className="error">{error}</p>}
      {authed ? (
        <form className="row" onSubmit={async (e) => { e.preventDefault(); await run({ action: 'addTeam', name: teamName }); setTeamName(''); }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" />
          <button className="btn primary" disabled={!teamName.trim()}>Add team</button>
        </form>
      ) : <p className="muted small">Log in as admin to add or edit teams and players.</p>}

      {data.teams.map((t) => {
        const ps = data.players.filter((p) => p.team_id === t.id);
        return (
          <section key={t.id} className="card">
            <div className="row between">
              <h3>{t.name} <span className="muted small">({ps.length})</span></h3>
              {authed && <button className="link danger" onClick={() => confirm(`Delete ${t.name}?`) && run({ action: 'deleteTeam', id: t.id })}>Delete team</button>}
            </div>
            <ul className="plain">
              {ps.map((p) => (
                <li key={p.id} className="row between">
                  <span>{p.name}</span>
                  {authed && <button className="link danger" onClick={() => run({ action: 'deletePlayer', id: p.id })}>✕</button>}
                </li>
              ))}
              {!ps.length && <li className="muted small">No players yet</li>}
            </ul>
            {authed && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                await run({ action: 'addPlayers', team_id: t.id, names: (names[t.id] || '').split(/[\n,]/) });
                setNames({ ...names, [t.id]: '' });
              }}>
                <textarea rows={2} value={names[t.id] || ''} onChange={(e) => setNames({ ...names, [t.id]: e.target.value })}
                  placeholder="Add players: one per line, or comma separated" />
                <button className="btn" disabled={!(names[t.id] || '').trim()}>Add players</button>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}
