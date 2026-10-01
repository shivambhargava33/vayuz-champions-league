// Pure scoring engine: derives everything from the ordered list of balls of one innings.
export const fmtOvers = (legal, bpo) => `${Math.floor(legal / bpo)}.${legal % bpo}`;

// Runs the batters physically ran on this ball (decides strike rotation).
function runsRun(b) {
  switch (b.extra_type) {
    case 'wide': return Math.max(0, b.extra_runs - 1);
    case 'noball': return b.runs_off_bat;
    case 'bye': case 'legbye': return b.extra_runs;
    default: return b.runs_off_bat;
  }
}

export function ballLabel(b) {
  if (b.event === 'penalty') return String(b.extra_runs);
  if (b.event === 'revive') return b.extra_runs ? `Rev ${b.extra_runs}` : 'Rev';
  const total = b.runs_off_bat + b.extra_runs;
  if (b.wicket_type) return total ? `W+${total}` : 'W';
  switch (b.extra_type) {
    case 'wide': return b.extra_runs > 1 ? `Wd+${b.extra_runs - 1}` : 'Wd';
    case 'noball': return b.runs_off_bat ? `Nb+${b.runs_off_bat}` : 'Nb';
    case 'bye': return `B${b.extra_runs}`;
    case 'legbye': return `LB${b.extra_runs}`;
    default: return String(b.runs_off_bat);
  }
}

/**
 * balls: rows of one innings ordered by seq.
 * cfg: { overs, ballsPerOver, squadSize, target? }
 */
export function computeInnings(balls, cfg) {
  const { overs, ballsPerOver: bpo, squadSize, target } = cfg;
  const s = {
    runs: 0, wickets: 0, legal: 0, extras: { wide: 0, noball: 0, bye: 0, legbye: 0 },
    batters: {}, bowlers: {}, striker: null, nonStriker: null, bowler: null, lastBowler: null,
    thisOver: [], lastOver: null, fallOfWickets: [], order: [], penalties: 0, revivals: 0,
  };
  const bat = (id) => (s.batters[id] ||= { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: null, bowler: null });
  const bowl = (id) => (s.bowlers[id] ||= { id, legal: 0, runs: 0, wickets: 0, wides: 0, noballs: 0 });

  let overBalls = [];
  for (const b of balls) {
    // Special events: -5 penalty, or reviving a dismissed batter (optionally costing runs).
    if (b.event) {
      s.runs += b.extra_runs; s.penalties += b.extra_runs;
      if (b.event === 'revive') {
        const o = bat(b.out_player_id);
        o.out = false; o.how = null; o.bowler = null;
        s.wickets -= 1; s.revivals += 1;
        const at = s.fallOfWickets.map((f) => f.player).lastIndexOf(b.out_player_id);
        if (at >= 0) s.fallOfWickets.splice(at, 1);
        if (!s.striker) s.striker = b.out_player_id; else if (!s.nonStriker) s.nonStriker = b.out_player_id;
      }
      overBalls.push(b);
      continue;
    }
    const total = b.runs_off_bat + b.extra_runs;
    s.runs += total;
    if (b.extra_type) s.extras[b.extra_type] += b.extra_runs;

    const st = bat(b.striker_id); if (b.non_striker_id) bat(b.non_striker_id);
    for (const id of [b.striker_id, b.non_striker_id]) if (id && !s.order.includes(id)) s.order.push(id);
    if (b.extra_type !== 'wide') st.balls += 1;
    st.runs += b.runs_off_bat;
    if (b.runs_off_bat === 4) st.fours += 1;
    if (b.runs_off_bat === 6) st.sixes += 1;

    const bw = bowl(b.bowler_id);
    if (b.is_legal) bw.legal += 1;
    if (b.extra_type === 'wide') bw.wides += b.extra_runs;
    if (b.extra_type === 'noball') bw.noballs += 1;
    bw.runs += b.runs_off_bat + (b.extra_type === 'wide' || b.extra_type === 'noball' ? b.extra_runs : 0);

    let striker = b.striker_id, non = b.non_striker_id;
    if (non && runsRun(b) % 2 === 1) [striker, non] = [non, striker];

    if (b.wicket_type) {
      s.wickets += 1;
      const o = bat(b.out_player_id);
      o.out = true; o.how = b.wicket_type; o.bowler = b.wicket_type === 'runout' ? null : b.bowler_id;
      if (b.wicket_type !== 'runout') bw.wickets += 1;
      s.fallOfWickets.push({ player: b.out_player_id, runs: s.runs, wicket: s.wickets, legal: s.legal + (b.is_legal ? 1 : 0) });
      if (striker === b.out_player_id) striker = null;
      else if (non === b.out_player_id) non = null;
    }

    let bowler = b.bowler_id;
    overBalls.push(b);
    if (b.is_legal) {
      s.legal += 1;
      if (s.legal % bpo === 0) { // over complete: change ends, new bowler needed
        if (non) [striker, non] = [non, striker];
        s.lastBowler = b.bowler_id;
        s.lastOver = { number: s.legal / bpo, balls: overBalls, runs: overBalls.reduce((a, x) => a + x.runs_off_bat + x.extra_runs, 0) };
        bowler = null;
        overBalls = [];
      }
    }
    // Last man stands: when only one batter is left he bats on alone, until he is out too.
    if (s.wickets >= squadSize - 1) { striker = s.wickets >= squadSize ? null : striker || non; non = null; }
    s.striker = striker; s.nonStriker = non; s.bowler = bowler;
  }
  s.thisOver = overBalls;
  s.overNumber = Math.floor(s.legal / bpo) + 1;
  s.thisOverRuns = overBalls.reduce((a, x) => a + x.runs_off_bat + x.extra_runs, 0);
  s.count = balls.length;

  const maxBalls = overs * bpo;
  s.allOut = s.wickets >= squadSize;
  s.lastMan = s.wickets === squadSize - 1;
  s.oversDone = s.legal >= maxBalls;
  s.targetReached = target != null && s.runs >= target;
  s.complete = s.allOut || s.oversDone || s.targetReached;
  s.totalExtras = Object.values(s.extras).reduce((a, n) => a + n, 0);
  s.oversText = fmtOvers(s.legal, bpo);
  s.runRate = s.legal ? (s.runs / s.legal) * bpo : 0;
  return s;
}

export function matchResult({ i1, i2, battingFirstName, chasingName, squadSize }) {
  if (i2.runs > i1.runs) return `${chasingName} won by ${squadSize - i2.wickets} wicket${squadSize - i2.wickets === 1 ? '' : 's'}`;
  if (i1.runs > i2.runs) return `${battingFirstName} won by ${i1.runs - i2.runs} run${i1.runs - i2.runs === 1 ? '' : 's'}`;
  return 'Match tied';
}
