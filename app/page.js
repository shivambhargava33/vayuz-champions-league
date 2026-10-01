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
    wkts: rows.filter((b) => b.wicket_type).length - rows.filter((b) => b.event === 'revive').length,
    legal: rows.filter((b) => b.is_legal).length,
    any: rows.length > 0,
  };
}

export default function Home() {
  const { authed, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/state').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const teamOf = (id) => data.teams.find((t) => t.id === id);
  const team = (id) => teamOf(id)?.name || '?';

  const label = (m) => {
    if (m.stage === 'semi') return `Semifinal ${m.match_no - 12}`;
    if (m.stage === 'final') return 'Final';
    if (m.stage === 'group') return `Match ${m.match_no} · Group ${teamOf(m.team_a)?.group_name || ''}`;
    return 'Friendly';
  };
  const byOrder = (a, b) => (a.play_order ?? 99) - (b.play_order ?? 99);
  const live = data.matches.filter((m) => m.status === 'live').sort(byOrder);
  const upcoming = data.matches.filter((m) => m.status === 'scheduled').sort(byOrder);
  const done = data.matches.filter((m) => m.status === 'completed').sort((a, b) => byOrder(b, a));

  const groupDone = data.matches.filter((m) => m.stage === 'group' && m.status === 'completed').length;
  const groupTotal = data.matches.filter((m) => m.stage === 'group').length;
  const semis = data.matches.filter((m) => m.stage === 'semi');
  const hasFinal = data.matches.some((m) => m.stage === 'final');
  const canSemis = isAdmin && groupTotal > 0 && groupDone === groupTotal && !semis.length;
  const canFinal = isAdmin && semis.length === 2 && semis.every((m) => m.status === 'completed') && !hasFinal;

  async function generate(stage) {
    setBusy(true); setError('');
    try { await write({ action: 'generateKnockouts', stage }); await load(); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const Card = (m) => {
    const first = m.batting_first || m.team_a, second = m.team_a === first ? m.team_b : m.team_a;
    const s1 = score(data.balls, m.id, 1), s2 = score(data.balls, m.id, 2);
    const sched = m.status === 'scheduled';
    return (
      <Link key={m.id} href={`/match/${m.id}`} className="card match-card">
        <div className="row between">
          <span className={`pill ${m.status}`}>{m.status === 'live' ? '● LIVE' : m.status === 'scheduled' ? 'UPCOMING' : 'FINISHED'}</span>
          <span className="muted small">{label(m)}</span>
        </div>
        {sched ? (
          <div className="row between"><b>{team(m.team_a)}</b><span className="muted small">vs</span><b>{team(m.team_b)}</b></div>
        ) : (
          <>
            <div className="row between"><b>{team(first)}</b><span>{s1.runs}/{s1.wkts} <span className="muted small">({fmtOvers(s1.legal, m.balls_per_over)})</span></span></div>
            <div className="row between"><b>{team(second)}</b><span>{s2.any || m.current_innings === 2 ? <>{s2.runs}/{s2.wkts} <span className="muted small">({fmtOvers(s2.legal, m.balls_per_over)})</span></> : <span className="muted small">yet to bat</span>}</span></div>
          </>
        )}
        {m.umpire && <div className="muted small">Umpire: {m.umpire}</div>}
        {m.result && <div className="result">{m.result}</div>}
        {isAdmin && (
          <button className="link danger small" style={{ alignSelf: 'flex-start' }} onClick={async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!confirm(`Delete ${team(m.team_a)} vs ${team(m.team_b)}${sched ? '' : ' and all its balls'}? This cannot be undone.`)) return;
            try { await write({ action: 'deleteMatch', match_id: m.id }); await load(); } catch (err) { setError(err.message); }
          }}>Delete match</button>
        )}
      </Link>
    );
  };

  return (
    <>
      <div className="row between">
        <h2>Matches</h2>
        {authed && <Link href="/match/new" className="btn">+ Friendly</Link>}
      </div>
      {error && <p className="error">{error}</p>}

      {(canSemis || canFinal) && (
        <div className="card stack">
          <b>{canSemis ? 'Group stage complete' : 'Semifinals complete'}</b>
          <button className="btn primary" disabled={busy} onClick={() => generate(canSemis ? 'semi' : 'final')}>
            {canSemis ? 'Create semifinals (A#1 v B#2, B#1 v A#2)' : 'Create final'}
          </button>
        </div>
      )}

      {!data.matches.length && <p className="muted">No matches yet.</p>}
      {live.length > 0 && <><h3>Live</h3>{live.map(Card)}</>}
      {upcoming.length > 0 && <><h3>Upcoming</h3>{upcoming.map(Card)}</>}
      {done.length > 0 && <><h3>Finished</h3>{done.map(Card)}</>}
      {!semis.length && groupTotal > 0 && (
        <p className="muted small">Knockouts: Semifinal 1 (Match 13) Group A #1 v Group B #2 · Semifinal 2 (Match 14) Group B #1 v Group A #2 · Final (Match 15).</p>
      )}
    </>
  );
}
