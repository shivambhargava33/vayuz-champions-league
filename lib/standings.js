// Points table from completed matches. Win = 2, loss = 0, tie = 1 each.
// NRR = (runs scored / overs faced) - (runs conceded / overs bowled).
// A side that is bowled out is charged its full quota of overs (standard NRR rule).
// Winning team id of a finished match (null for a tie with no tie-breaker winner, or no result).
export function matchWinner(m, balls) {
  if (m.winner_id) return m.winner_id;
  const tot = (i) => balls.filter((b) => b.match_id === m.id && b.innings === i).reduce((a, b) => a + b.runs_off_bat + b.extra_runs, 0);
  const first = m.batting_first, second = m.team_a === first ? m.team_b : m.team_a;
  const a = tot(1), b = tot(2);
  return a > b ? first : b > a ? second : null;
}

export function computeStandings(teams, players, matches, balls) {
  const rows = Object.fromEntries(teams.map((t) => [t.id, {
    id: t.id, name: t.name, played: 0, won: 0, lost: 0, tied: 0, points: 0,
    runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0,
  }]));
  const size = (tid) => players.filter((p) => p.team_id === tid).length;

  for (const m of matches) {
    if (m.status !== 'completed' || m.stage !== 'group') continue;
    const inn = (i) => {
      const rows_ = balls.filter((b) => b.match_id === m.id && b.innings === i);
      return {
        any: rows_.length > 0,
        runs: rows_.reduce((a, b) => a + b.runs_off_bat + b.extra_runs, 0),
        wkts: rows_.filter((b) => b.wicket_type).length,
        legal: rows_.filter((b) => b.is_legal).length,
      };
    };
    const first = m.batting_first, second = m.team_a === first ? m.team_b : m.team_a;
    const a = inn(1), b = inn(2);
    if (!a.any || !b.any) continue; // abandoned before the chase: not counted
    const quota = m.overs * m.balls_per_over;
    const faced = (s, tid) => (s.wkts >= Math.max(2, Math.min(m.players_per_side, size(tid))) - 1 ? quota : s.legal);

    const A = rows[first], B = rows[second];
    if (!A || !B) continue;
    A.played++; B.played++;
    A.runsFor += a.runs; A.ballsFor += faced(a, first); A.runsAgainst += b.runs; A.ballsAgainst += faced(b, second);
    B.runsFor += b.runs; B.ballsFor += faced(b, second); B.runsAgainst += a.runs; B.ballsAgainst += faced(a, first);
    if (a.runs === b.runs) { A.tied++; B.tied++; A.points++; B.points++; }
    else {
      const [w, l] = a.runs > b.runs ? [A, B] : [B, A];
      w.won++; w.points += 2; l.lost++;
    }
    A.bpo = B.bpo = m.balls_per_over;
  }

  const bpo = matches[0]?.balls_per_over || 3;
  return Object.values(rows).map((r) => ({
    ...r,
    nrr: (r.ballsFor ? (r.runsFor / r.ballsFor) * bpo : 0) - (r.ballsAgainst ? (r.runsAgainst / r.ballsAgainst) * bpo : 0),
  })).sort((x, y) => y.points - x.points || y.nrr - x.nrr || y.won - x.won || x.name.localeCompare(y.name));
}
