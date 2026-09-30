'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, write } from '@/lib/client';
import { useAuth } from '@/components/Shell';
import { fmtOvers } from '@/lib/scoring';

function score(balls, matchId, innings) {
  const rows = balls.filter((b) => b.match_id === matchId && b.innings === innings);
  return {
    runs: rows.reduce((a, b) => a + b.runs_off_bat + b.extra_runs, 0),
    wkts: rows.filter((b) => b.wicket_type).length,
    legal: rows.filter((b) => b.is_legal).length,
    any: rows.length > 0,
  };
}

export default function Home() {
  const { authed, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/api/state').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const team = (id) => data.teams.find((t) => t.id === id)?.name || '?';

  return (
    <>
      <div className="row between">
        <h2>Matches</h2>
        {authed && <Link href="/match/new" className="btn primary">+ New match</Link>}
      </div>
      {!data.matches.length && <p className="muted">No matches yet. {data.teams.length < 2 ? 'Start by creating two teams.' : ''}</p>}
      {data.matches.map((m) => {
        const first = m.batting_first, second = m.team_a === first ? m.team_b : m.team_a;
        const s1 = score(data.balls, m.id, 1), s2 = score(data.balls, m.id, 2);
        return (
          <Link key={m.id} href={`/match/${m.id}`} className="card match-card">
            <div className="row between">
              <span className={`pill ${m.status}`}>{m.status === 'live' ? '● LIVE' : 'FINISHED'}</span>
              <span className="muted small">{m.overs} ov · {m.balls_per_over} balls/over</span>
            </div>
            <div className="row between"><b>{team(first)}</b><span>{s1.runs}/{s1.wkts} <span className="muted small">({fmtOvers(s1.legal, m.balls_per_over)})</span></span></div>
            <div className="row between"><b>{team(second)}</b><span>{s2.any || m.current_innings === 2 ? <>{s2.runs}/{s2.wkts} <span className="muted small">({fmtOvers(s2.legal, m.balls_per_over)})</span></> : <span className="muted small">yet to bat</span>}</span></div>
            {m.umpire && <div className="muted small">Umpire: {m.umpire}</div>}
            {m.result && <div className="result">{m.result}</div>}
            {isAdmin && (
              <button className="link danger small" style={{ alignSelf: 'flex-start' }} onClick={async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!confirm(`Delete ${team(first)} vs ${team(second)} and all its balls? This cannot be undone.`)) return;
                try { await write({ action: 'deleteMatch', match_id: m.id }); await load(); } catch (err) { setError(err.message); }
              }}>Delete match</button>
            )}
          </Link>
        );
      })}
    </>
  );
}
