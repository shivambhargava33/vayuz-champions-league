'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, write } from '@/lib/client';
import { useAuth } from '@/components/Shell';
import { ballLabel, computeInnings, matchResult } from '@/lib/scoring';

const MODES = [['none', 'Normal'], ['wide', 'Wide'], ['noball', 'No ball'], ['bye', 'Bye'], ['legbye', 'Leg bye']];
const HOW = { bowled: 'b', caught: 'c', lbw: 'lbw', stumped: 'st', runout: 'run out', hitwicket: 'hit wkt' };

export default function MatchPage() {
  const { id } = useParams();
  const { authed, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('none');
  const [pick, setPick] = useState({});
  const [wk, setWk] = useState(null); // wicket dialog state
  const [showCard, setShowCard] = useState(false);
  const [sf, setSf] = useState({}); // start-match form for scheduled fixtures
  const [winnerPick, setWinnerPick] = useState('');
  const [rv, setRv] = useState(null); // revive-batter dialog
  const [swapped, setSwapped] = useState(false); // umpire override: flip strike before the next ball

  const load = useCallback(() => api(`/api/match?id=${id}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const m = data?.match;
  const view = useMemo(() => {
    if (!data) return null;
    const { match, balls, players, teams } = data;
    const tName = (tid) => teams.find((t) => t.id === tid)?.name || '?';
    const pName = (pid) => players.find((p) => p.id === pid)?.name || 'Unknown';
    const teamPlayers = (tid) => players.filter((p) => p.team_id === tid);
    const other = (tid) => (match.team_a === tid ? match.team_b : match.team_a);
    const bats = { 1: match.batting_first, 2: other(match.batting_first) };
    const squad = (tid) => Math.max(2, Math.min(match.players_per_side, teamPlayers(tid).length));
    const cfg = (inn, target) => ({ overs: match.overs, ballsPerOver: match.balls_per_over, squadSize: squad(bats[inn]), target });
    const i1 = computeInnings(balls.filter((b) => b.innings === 1), cfg(1));
    const i2 = computeInnings(balls.filter((b) => b.innings === 2), cfg(2, i1.runs + 1));
    return { match, balls, tName, pName, teamPlayers, bats, squad, i1, i2, inn: { 1: i1, 2: i2 } };
  }, [data]);

  if (!view) return <p className={error ? 'error' : 'muted'}>{error || 'Loading…'}</p>;
  const { balls, tName, pName, teamPlayers, bats, squad, i1, i2 } = view;
  const bpo = m.balls_per_over;
  const grp = data.teams.find((t) => t.id === m.team_a)?.group_name;
  const stageLabel = m.stage === 'semi' ? `Semifinal ${m.match_no - 12}` : m.stage === 'final' ? 'Final'
    : m.stage === 'group' ? `Match ${m.match_no} · Group ${grp || ''}` : 'Friendly';

  if (m.status === 'scheduled') {
    const f = { bf: sf.bf ?? '', overs: sf.overs ?? m.overs, pps: sf.pps ?? m.players_per_side, umpire: sf.umpire ?? (m.umpire || '') };
    const setF = (k, v) => setSf({ ...sf, [k]: v });
    return (
      <>
        <div className="row between"><span className="pill">UPCOMING</span><span className="muted small">{stageLabel}</span></div>
        <section className="card"><h2>{tName(m.team_a)} vs {tName(m.team_b)}</h2></section>
        {error && <p className="error">{error}</p>}
        {authed ? (
          <form className="card stack" onSubmit={(e) => { e.preventDefault(); act({ action: 'startMatch', match_id: m.id, batting_first: f.bf, overs: f.overs, players_per_side: f.pps, umpire: f.umpire }); }}>
            <b>Start match</b>
            <label>Who bats first (after toss)?
              <select value={f.bf} onChange={(e) => setF('bf', e.target.value)}>
                <option value="">Select…</option>
                <option value={m.team_a}>{tName(m.team_a)}</option>
                <option value={m.team_b}>{tName(m.team_b)}</option>
              </select>
            </label>
            <div className="row">
              <label className="grow">Overs per innings<input type="number" min="1" max="50" value={f.overs} onChange={(e) => setF('overs', e.target.value)} /></label>
              <label className="grow">Players per side<input type="number" min="2" max="15" value={f.pps} onChange={(e) => setF('pps', e.target.value)} /></label>
            </div>
            <label>Umpire (optional)<input value={f.umpire} onChange={(e) => setF('umpire', e.target.value)} placeholder="Umpire name" /></label>
            <button className="btn primary" disabled={busy || !f.bf}>Start match</button>
          </form>
        ) : <p className="muted">This match hasn't started yet. Umpires: log in (top right) to start it.</p>}
        {isAdmin && <button className="link danger small" style={{ alignSelf: 'flex-start' }} onClick={() => confirm('Delete this fixture?') && write({ action: 'deleteMatch', match_id: m.id }).then(() => (location.href = '/'))}>Delete match</button>}
      </>
    );
  }
  const n = m.current_innings;
  const cur = view.inn[n];
  const batTeam = bats[n], bowlTeam = bats[n === 1 ? 2 : 1];
  const live = m.status === 'live';
  const curBalls = balls.filter((x) => x.innings === n);
  const lastBall = curBalls[curBalls.length - 1];
  const chipClass = (x) => (x.event ? 'x' : x.wicket_type ? 'w' : x.runs_off_bat >= 4 ? 'b' : x.extra_type ? 'x' : '');
  const canScore = authed && live && !cur.complete;

  let striker = cur.striker || pick.striker || null;
  let nonStriker = cur.nonStriker || pick.nonStriker || null;
  if (swapped && striker && nonStriker) [striker, nonStriker] = [nonStriker, striker];
  const bowler = cur.bowler || pick.bowler || null;
  const lastMan = cur.wickets >= squad(batTeam) - 1; // only one batter left: he bats alone
  const ready = striker && bowler && (nonStriker || lastMan);

  const onField = new Set([striker, nonStriker].filter(Boolean));
  const batOptions = teamPlayers(batTeam).filter((p) => !cur.batters[p.id]?.out && !onField.has(p.id));
  let bowlOptions = teamPlayers(bowlTeam);
  if (bowlOptions.length > 1) bowlOptions = bowlOptions.filter((p) => p.id !== cur.lastBowler);

  async function act(body) {
    setBusy(true); setError('');
    let res = null;
    try { res = await write(body); await load(); } catch (e) { setError(e.message); }
    setBusy(false);
    return res;
  }

  async function score(runs, wicket) {
    if (!ready || busy) return;
    const ball = { striker_id: striker, non_striker_id: nonStriker || null, bowler_id: bowler, runs_off_bat: 0, extra_runs: 0, extra_type: mode === 'none' ? null : mode };
    if (mode === 'wide') ball.extra_runs = 1 + runs;
    else if (mode === 'noball') { ball.extra_runs = 1; ball.runs_off_bat = runs; }
    else if (mode === 'bye' || mode === 'legbye') ball.extra_runs = runs;
    else ball.runs_off_bat = runs;
    if (wicket) { ball.wicket_type = wicket.type; ball.out_player_id = wicket.out; }
    await act({ action: 'addBall', match_id: m.id, ball });
    setPick({}); setMode('none'); setWk(null); setSwapped(false);
  }

  async function undo() {
    const res = await act({ action: 'undoBall', match_id: m.id });
    setSwapped(false);
    // put back the players from the removed ball, so the bowler/batters aren't lost
    setPick(res?.removed ? { striker: res.removed.striker_id, nonStriker: res.removed.non_striker_id, bowler: res.removed.bowler_id } : {});
  }

  const bfName = tName(bats[1]), chName = tName(bats[2]);
  const finishText = matchResult({ i1, i2, battingFirstName: bfName, chasingName: chName, squadSize: squad(bats[2]) });
  const isTie = i2.runs === i1.runs;
  const needsPick = isTie && m.stage !== 'friendly';
  const winnerId = i2.runs > i1.runs ? bats[2] : i1.runs > i2.runs ? bats[1] : winnerPick || null;
  const resultText = needsPick && winnerPick ? `${tName(winnerPick)} won (tie-breaker)` : finishText;
  const ballsLeft = m.overs * bpo - i2.legal;
  const wkTypes = mode === 'noball' ? ['runout'] : mode === 'wide' ? ['stumped', 'runout', 'hitwicket'] : ['bowled', 'caught', 'lbw', 'stumped', 'runout', 'hitwicket'];

  const Sel = ({ label, value, onChange, options }) => (
    <label>{label}
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );

  const b = (id) => cur.batters[id];
  const bw = cur.bowlers[bowler];

  return (
    <>
      <div className="row between">
        <span className={`pill ${m.status}`}>{live ? '● LIVE' : 'FINISHED'}</span>
        <span className="muted small">{stageLabel} · {m.overs} ov · {bpo} balls/over</span>
      </div>
      {m.umpire && <div className="muted small">Umpire: <b>{m.umpire}</b></div>}

      {/* Scoreboard */}
      <section className="card score">
        {[1, 2].map((i) => (i === 1 || n === 2 || view.inn[2].count > 0) && (
          <div key={i} className={`row between ${i === n && live ? 'active' : 'dim'}`}>
            <span className="team">{tName(bats[i])}</span>
            <span className="big">{view.inn[i].runs}/{view.inn[i].wickets} <small>({view.inn[i].oversText})</small></span>
          </div>
        ))}
        {n === 1 && live && <div className="muted small">CRR {cur.runRate.toFixed(2)}</div>}
        {n === 2 && live && !i2.complete && (
          <div className="target">Need {Math.max(0, i1.runs + 1 - i2.runs)} from {ballsLeft} ball{ballsLeft === 1 ? '' : 's'} · target {i1.runs + 1}</div>
        )}
        {m.result && <div className="result">{m.result}</div>}
      </section>

      {/* At the crease */}
      {live && !cur.complete && (
        <section className="card">
          {[[striker, '*'], [nonStriker, '']].map(([pid, mark], i) => pid && (
            <div key={i} className="row between">
              <span>{pName(pid)}{mark}</span>
              <span>{b(pid)?.runs ?? 0} <span className="muted small">({b(pid)?.balls ?? 0})</span></span>
            </div>
          ))}
          {canScore && striker && nonStriker && (
            <div className="row between">
              <button className={`mode ${swapped ? 'on' : ''}`} onClick={() => setSwapped(!swapped)}>⇄ Swap strike</button>
              {swapped && <span className="muted small">Strike swapped for next ball</span>}
            </div>
          )}
          {bowler && (
            <div className="row between muted small">
              <span>Bowler: {pName(bowler)}</span>
              <span>{bw ? `${Math.floor(bw.legal / bpo)}.${bw.legal % bpo}-${bw.runs}-${bw.wickets}` : '0.0-0-0'}</span>
            </div>
          )}
        </section>
      )}

      {/* Ball tracker */}
      {live && (curBalls.length > 0 || !cur.complete) && (
        <section className="card tracker">
          <div className="row between">
            <span className="muted small">{cur.complete ? 'Innings over' : `Over ${cur.overNumber}`}</span>
            {lastBall && <span className="row"><span className="muted small">Last ball</span><span className={`chip big ${chipClass(lastBall)}`}>{ballLabel(lastBall)}</span></span>}
          </div>
          <div className="chips">
            {cur.thisOver.map((x, i) => <span key={i} className={`chip ${chipClass(x)}`}>{ballLabel(x)}</span>)}
            {!cur.thisOver.length && <span className="muted small">{cur.lastOver ? `Over ${cur.lastOver.number} complete — new over` : 'New over'}</span>}
            {cur.thisOver.length > 0 && <span className="muted small">= {cur.thisOverRuns} run{cur.thisOverRuns === 1 ? '' : 's'}</span>}
          </div>
          {cur.lastOver && (
            <div className="chips prev">
              <span className="muted small">Over {cur.lastOver.number}</span>
              {cur.lastOver.balls.map((x, i) => <span key={i} className={`chip sm ${chipClass(x)}`}>{ballLabel(x)}</span>)}
              <span className="muted small">= {cur.lastOver.runs}</span>
            </div>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {/* Innings/match transitions */}
      {/* Special: -5 penalty, revive a batter */}
      {authed && live && (
        <div className="row">
          <button className="btn grow" disabled={busy} onClick={() => confirm(`Deduct 5 runs from ${tName(batTeam)}?`) && act({ action: 'addEvent', match_id: m.id, event: 'penalty' })}>−5 runs</button>
          <button className="btn grow" disabled={busy || !Object.values(cur.batters).some((x) => x.out) || (cur.striker && cur.nonStriker)} onClick={() => setRv({ player: '', deduct: true })}>Revive batter</button>
        </div>
      )}

      {authed && live && n === 1 && i1.complete && (
        <div className="card stack">
          <b>Innings complete: {i1.runs}/{i1.wickets}. Target {i1.runs + 1}.</b>
          <button className="btn primary" disabled={busy} onClick={() => act({ action: 'startSecondInnings', match_id: m.id })}>Start 2nd innings</button>
        </div>
      )}
      {authed && live && n === 2 && i2.complete && (
        <div className="card stack">
          <b>{finishText}</b>
          {needsPick && <Sel label="Who won the tie-breaker (super over)?" value={winnerPick} onChange={setWinnerPick} options={[{ id: bats[1], name: bfName }, { id: bats[2], name: chName }]} />}
          <button className="btn primary" disabled={busy || (needsPick && !winnerPick)} onClick={() => act({ action: 'finishMatch', match_id: m.id, result: resultText, winner_id: winnerId })}>Finish match</button>
        </div>
      )}

      {/* Scorer controls */}
      {canScore && (
        <section className="card stack">
          {!ready && (
            <>
              <b>Set players</b>
              {!striker && <Sel label={cur.wickets ? 'New batter' : 'Striker'} value={pick.striker} onChange={(v) => setPick({ ...pick, striker: v })} options={batOptions.filter((p) => p.id !== nonStriker)} />}
              {!nonStriker && !lastMan && <Sel label={cur.wickets && !nonStriker ? 'New batter' : 'Non-striker'} value={pick.nonStriker} onChange={(v) => setPick({ ...pick, nonStriker: v })} options={batOptions.filter((p) => p.id !== striker)} />}
              {!bowler && <Sel label="Bowler" value={pick.bowler} onChange={(v) => setPick({ ...pick, bowler: v })} options={bowlOptions} />}
            </>
          )}
          {ready && (
            <>
              <div className="modes">
                {MODES.map(([k, l]) => <button key={k} className={`mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{l}</button>)}
              </div>
              <div className="runs">
                {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                  <button key={r} className={`run r${r}`} disabled={busy} onClick={() => score(r)}>
                    {mode === 'none' ? r : r === 0 && (mode === 'wide' || mode === 'noball') ? (mode === 'wide' ? 'Wd' : 'Nb') : `+${r}`}
                  </button>
                ))}
                <button className="run wkt" disabled={busy} onClick={() => setWk({ type: wkTypes[0], out: striker, runs: 0 })}>OUT</button>
              </div>
              <div className="row between">
                <span className="muted small">{mode === 'none' ? 'Tap runs scored off the ball' : `${MODES.find((x) => x[0] === mode)[1]}: tap additional runs`}</span>
                <button className="link danger" disabled={busy || !balls.some((x) => x.innings === n)} onClick={undo}>↩ Undo last ball</button>
              </div>
            </>
          )}
        </section>
      )}
      {authed && (
        <div className="row between small">
          {live
            ? <span className="row">
              {n === 1 && <button className="link" disabled={busy} onClick={() => confirm(`End innings at ${i1.runs}/${i1.wickets}? ${tName(bats[2])} will need ${i1.runs + 1} to win.`) && act({ action: 'startSecondInnings', match_id: m.id })}>End innings</button>}
              {n === 2 && <button className="link" disabled={busy || (needsPick && !winnerPick)} onClick={() => confirm(`End innings now? Result: ${resultText}`) && act({ action: 'finishMatch', match_id: m.id, result: resultText, winner_id: winnerId })}>End innings</button>}
              <button className="link" onClick={() => confirm('End this match now?') && act({ action: 'finishMatch', match_id: m.id, result: n === 2 && i2.count > 0 ? finishText : 'Match abandoned' })}>End match early</button></span>
            : isAdmin ? <button className="link" onClick={() => act({ action: 'reopenMatch', match_id: m.id })}>Reopen match</button> : <span />}
          {isAdmin && <button className="link danger" onClick={() => confirm('Delete this match and all its balls?') && write({ action: 'deleteMatch', match_id: m.id }).then(() => (location.href = '/'))}>Delete match</button>}
        </div>
      )}

      {/* Scorecard */}
      <button className="btn" onClick={() => setShowCard(!showCard)}>{showCard ? 'Hide' : 'Show'} full scorecard</button>
      {showCard && [1, 2].filter((i) => i === 1 || view.inn[2].order.length).map((i) => {
        const s = view.inn[i];
        return (
          <section key={i} className="card">
            <h3>{tName(bats[i])} innings: {s.runs}/{s.wickets} ({s.oversText})</h3>
            <table>
              <thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr></thead>
              <tbody>
                {s.order.map((pid) => { const x = s.batters[pid]; return (
                  <tr key={pid}><td>{pName(pid)}</td><td className="muted small">{x.out ? `${HOW[x.how]}${x.bowler ? ' ' + pName(x.bowler) : ''}` : 'not out'}</td><td><b>{x.runs}</b></td><td>{x.balls}</td><td>{x.fours}</td><td>{x.sixes}</td></tr>
                ); })}
              </tbody>
            </table>
            <p className="small muted">{s.penalties ? `Penalties ${s.penalties} · ` : ''}Extras {s.totalExtras} (wd {s.extras.wide}, nb {s.extras.noball}, b {s.extras.bye}, lb {s.extras.legbye})</p>
            <table>
              <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr></thead>
              <tbody>
                {Object.values(s.bowlers).map((x) => (
                  <tr key={x.id}><td>{pName(x.id)}</td><td>{Math.floor(x.legal / bpo)}.{x.legal % bpo}</td><td>{x.runs}</td><td><b>{x.wickets}</b></td></tr>
                ))}
              </tbody>
            </table>
            {!!s.fallOfWickets.length && <p className="small muted">FOW: {s.fallOfWickets.map((f) => `${f.runs}/${f.wicket} (${pName(f.player)})`).join(', ')}</p>}
          </section>
        );
      })}

      {/* Revive dialog */}
      {rv && (
        <div className="modal-bg" onClick={() => setRv(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Revive batter</h3>
            <label>Who comes back?
              <select value={rv.player} onChange={(e) => setRv({ ...rv, player: e.target.value })}>
                <option value="">Select…</option>
                {Object.values(cur.batters).filter((x) => x.out).map((x) => <option key={x.id} value={x.id}>{pName(x.id)}</option>)}
              </select>
            </label>
            <label className="row" style={{ flexDirection: 'row', alignItems: 'center', gap: '.5rem' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={rv.deduct} onChange={(e) => setRv({ ...rv, deduct: e.target.checked })} />
              Deduct 5 runs from {tName(batTeam)}
            </label>
            <div className="row">
              <button className="btn grow" onClick={() => setRv(null)}>Cancel</button>
              <button className="btn primary grow" disabled={busy || !rv.player} onClick={async () => { await act({ action: 'addEvent', match_id: m.id, event: 'revive', player_id: rv.player, deduct: rv.deduct }); setRv(null); }}>Revive</button>
            </div>
          </div>
        </div>
      )}

      {/* Wicket dialog */}
      {wk && (
        <div className="modal-bg" onClick={() => setWk(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Wicket</h3>
            <label>How out
              <select value={wk.type} onChange={(e) => setWk({ ...wk, type: e.target.value, out: e.target.value === 'runout' ? wk.out : striker })}>
                {wkTypes.map((t) => <option key={t} value={t}>{HOW[t] === 'b' ? 'bowled' : t}</option>)}
              </select>
            </label>
            {wk.type === 'runout' && (
              <label>Who is out
                <select value={wk.out} onChange={(e) => setWk({ ...wk, out: e.target.value })}>
                  <option value={striker}>{pName(striker)} (striker)</option>
                  {nonStriker && <option value={nonStriker}>{pName(nonStriker)} (non-striker)</option>}
                </select>
              </label>
            )}
            <div>
              <span className="muted small">Runs completed on this ball</span>
              <div className="modes">{[0, 1, 2, 3].map((r) => <button key={r} className={`mode ${wk.runs === r ? 'on' : ''}`} onClick={() => setWk({ ...wk, runs: r })}>{r}</button>)}</div>
            </div>
            <div className="row">
              <button className="btn grow" onClick={() => setWk(null)}>Cancel</button>
              <button className="btn primary grow" disabled={busy} onClick={() => score(wk.runs, { type: wk.type, out: wk.out })}>Confirm out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
