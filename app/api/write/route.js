import { NextResponse } from 'next/server';
import { db, getRole } from '@/lib/server';
import { computeStandings, matchWinner } from '@/lib/standings';

export const dynamic = 'force-dynamic';

// Actions an umpire may perform; everything else is admin-only.
const UMPIRE_ACTIONS = ['createMatch', 'startMatch', 'addEvent', 'addBall', 'undoBall', 'startSecondInnings', 'finishMatch'];

const clean = (s) => String(s || '').trim().slice(0, 60);
const int = (n, d = 0) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : d);

export async function POST(request) {
  const role = getRole(request);
  if (!role) return NextResponse.json({ error: 'Please log in' }, { status: 401 });
  try {
    const body = await request.json();
    if (role !== 'admin' && !UMPIRE_ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: 'Admin login required for this action' }, { status: 403 });
    }
    const sb = db();
    const ok = (data = {}) => NextResponse.json({ ok: true, ...data });
    const fail = (msg, status = 400) => NextResponse.json({ error: msg }, { status });
    const check = ({ error }) => { if (error) throw error; };

    switch (body.action) {
      case 'addTeam': {
        const name = clean(body.name);
        if (!name) return fail('Team name required');
        check(await sb.from('teams').insert({ name }));
        return ok();
      }
      case 'deleteTeam': {
        const used = await sb.from('matches').select('id').or(`team_a.eq.${body.id},team_b.eq.${body.id}`).limit(1);
        if (used.data?.length) return fail('This team has matches and cannot be deleted');
        check(await sb.from('teams').delete().eq('id', body.id));
        return ok();
      }
      case 'addPlayers': {
        // names: array of strings, so a whole squad can be pasted at once
        const rows = (body.names || []).map(clean).filter(Boolean).map((name) => ({ team_id: body.team_id, name }));
        if (!rows.length) return fail('Player name required');
        check(await sb.from('players').insert(rows));
        return ok();
      }
      case 'deletePlayer': {
        check(await sb.from('players').delete().eq('id', body.id));
        return ok();
      }
      case 'createMatch': {
        const { team_a, team_b, batting_first } = body;
        if (!team_a || !team_b || team_a === team_b) return fail('Pick two different teams');
        if (![team_a, team_b].includes(batting_first)) return fail('Pick who bats first');
        const overs = int(body.overs, 0), pps = int(body.players_per_side, 0);
        if (overs < 1 || overs > 50) return fail('Overs must be 1-50');
        if (pps < 2 || pps > 15) return fail('Players per side must be 2-15');
        const umpire = clean(body.umpire);
        const { data, error } = await sb.from('matches')
          .insert({ team_a, team_b, batting_first, overs, players_per_side: pps, balls_per_over: 3, ...(umpire && { umpire }) })
          .select().single();
        if (error) throw error;
        return ok({ id: data.id });
      }
      case 'startMatch': {
        const { data: m, error: me } = await sb.from('matches').select('*').eq('id', body.match_id).single();
        if (me) throw me;
        if (m.status !== 'scheduled') return fail('Match already started');
        if (![m.team_a, m.team_b].includes(body.batting_first)) return fail('Pick who bats first');
        const overs = int(body.overs, 0), pps = int(body.players_per_side, 0);
        if (overs < 1 || overs > 50) return fail('Overs must be 1-50');
        if (pps < 2 || pps > 15) return fail('Players per side must be 2-15');
        const umpire = clean(body.umpire);
        check(await sb.from('matches').update({ status: 'live', batting_first: body.batting_first, overs, players_per_side: pps, umpire: umpire || null }).eq('id', m.id));
        return ok();
      }
      case 'generateKnockouts': {
        const [teams, players, matches, balls] = await Promise.all([
          sb.from('teams').select('*'), sb.from('players').select('*'), sb.from('matches').select('*'),
          sb.from('balls').select('match_id,innings,runs_off_bat,extra_runs,is_legal,wicket_type'),
        ]);
        for (const r of [teams, players, matches, balls]) check(r);
        const M = matches.data;
        if (body.stage === 'semi') {
          if (M.some((m) => m.stage === 'semi')) return fail('Semifinals already created');
          const left = M.filter((m) => m.stage === 'group' && m.status !== 'completed').length;
          if (left) return fail(`${left} group match${left === 1 ? '' : 'es'} still to be completed`);
          const top = (g) => {
            const ts = teams.data.filter((t) => t.group_name === g);
            const gm = M.filter((m) => m.stage === 'group' && ts.some((t) => t.id === m.team_a));
            return computeStandings(ts, players.data, gm, balls.data).slice(0, 2).map((r) => r.id);
          };
          const [a1, a2] = top('A'), [b1, b2] = top('B');
          if (!a1 || !a2 || !b1 || !b2) return fail('Groups are not set up');
          const base = { overs: 6, players_per_side: 6, balls_per_over: 3, status: 'scheduled', stage: 'semi' };
          check(await sb.from('matches').insert([
            { ...base, team_a: a1, team_b: b2, match_no: 13, play_order: 13 },
            { ...base, team_a: b1, team_b: a2, match_no: 14, play_order: 14 },
          ]));
          return ok();
        }
        if (body.stage === 'final') {
          if (M.some((m) => m.stage === 'final')) return fail('Final already created');
          const semis = M.filter((m) => m.stage === 'semi').sort((x, y) => x.match_no - y.match_no);
          if (semis.length < 2 || semis.some((m) => m.status !== 'completed')) return fail('Both semifinals must be completed');
          const w = semis.map((m) => matchWinner(m, balls.data));
          if (w.some((x) => !x)) return fail('A semifinal has no winner (tie): re-finish it and pick the tie-breaker winner');
          check(await sb.from('matches').insert({ overs: 6, players_per_side: 6, balls_per_over: 3, status: 'scheduled', stage: 'final', team_a: w[0], team_b: w[1], match_no: 15, play_order: 15 }));
          return ok();
        }
        return fail('Unknown stage');
      }
      case 'addBall': {
        const { data: m, error: me } = await sb.from('matches').select('*').eq('id', body.match_id).single();
        if (me) throw me;
        if (m.status !== 'live') return fail('Match is finished');
        const b = body.ball || {};
        if (!b.striker_id || !b.bowler_id) return fail('Select striker and bowler');
        const { data: last } = await sb.from('balls').select('seq').eq('match_id', m.id).eq('innings', m.current_innings)
          .order('seq', { ascending: false }).limit(1);
        const seq = (last?.[0]?.seq ?? 0) + 1;
        const extra_type = ['wide', 'noball', 'bye', 'legbye'].includes(b.extra_type) ? b.extra_type : null;
        check(await sb.from('balls').insert({
          match_id: m.id, innings: m.current_innings, seq,
          striker_id: b.striker_id, non_striker_id: b.non_striker_id || null, bowler_id: b.bowler_id,
          runs_off_bat: Math.max(0, int(b.runs_off_bat)), extra_type, extra_runs: Math.max(0, int(b.extra_runs)),
          is_legal: extra_type !== 'wide' && extra_type !== 'noball',
          wicket_type: b.wicket_type || null, out_player_id: b.wicket_type ? b.out_player_id : null,
        }));
        return ok();
      }
      case 'addEvent': {
        // -5 runs penalty, or reviving a dismissed batter (optionally costing 5 runs)
        const { data: m, error: me } = await sb.from('matches').select('current_innings,status').eq('id', body.match_id).single();
        if (me) throw me;
        if (m.status !== 'live') return fail('Match is not live');
        if (!['penalty', 'revive'].includes(body.event)) return fail('Unknown event');
        if (body.event === 'revive' && !body.player_id) return fail('Pick the batter to revive');
        const { data: last } = await sb.from('balls').select('seq').eq('match_id', body.match_id).eq('innings', m.current_innings)
          .order('seq', { ascending: false }).limit(1);
        const cost = body.event === 'penalty' || body.deduct ? -5 : 0;
        check(await sb.from('balls').insert({
          match_id: body.match_id, innings: m.current_innings, seq: (last?.[0]?.seq ?? 0) + 1,
          runs_off_bat: 0, extra_runs: cost, is_legal: false, event: body.event,
          out_player_id: body.event === 'revive' ? body.player_id : null,
        }));
        return ok();
      }
      case 'undoBall': {
        const { data: m } = await sb.from('matches').select('current_innings').eq('id', body.match_id).single();
        const { data: last } = await sb.from('balls').select('id,striker_id,non_striker_id,bowler_id').eq('match_id', body.match_id).eq('innings', m.current_innings)
          .order('seq', { ascending: false }).limit(1);
        if (!last?.length) return fail('Nothing to undo');
        check(await sb.from('balls').delete().eq('id', last[0].id));
        return ok({ removed: last[0] });
      }
      case 'startSecondInnings': {
        check(await sb.from('matches').update({ current_innings: 2 }).eq('id', body.match_id).eq('current_innings', 1));
        return ok();
      }
      case 'finishMatch': {
        check(await sb.from('matches').update({ status: 'completed', result: clean(body.result), winner_id: body.winner_id || null }).eq('id', body.match_id));
        return ok();
      }
      case 'reopenMatch': {
        check(await sb.from('matches').update({ status: 'live', result: null, winner_id: null }).eq('id', body.match_id));
        return ok();
      }
      case 'deleteMatch': {
        check(await sb.from('matches').delete().eq('id', body.match_id));
        return ok();
      }
      default:
        return fail('Unknown action');
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
