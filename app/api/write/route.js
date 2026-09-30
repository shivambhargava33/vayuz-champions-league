import { NextResponse } from 'next/server';
import { db, getRole } from '@/lib/server';

export const dynamic = 'force-dynamic';

// Actions an umpire may perform; everything else is admin-only.
const UMPIRE_ACTIONS = ['createMatch', 'addBall', 'undoBall', 'startSecondInnings', 'finishMatch'];

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
        const { data, error } = await sb.from('matches')
          .insert({ team_a, team_b, batting_first, overs, players_per_side: pps, balls_per_over: 3 })
          .select().single();
        if (error) throw error;
        return ok({ id: data.id });
      }
      case 'addBall': {
        const { data: m, error: me } = await sb.from('matches').select('*').eq('id', body.match_id).single();
        if (me) throw me;
        if (m.status !== 'live') return fail('Match is finished');
        const b = body.ball || {};
        if (!b.striker_id || !b.non_striker_id || !b.bowler_id) return fail('Select striker, non-striker and bowler');
        const { data: last } = await sb.from('balls').select('seq').eq('match_id', m.id).eq('innings', m.current_innings)
          .order('seq', { ascending: false }).limit(1);
        const seq = (last?.[0]?.seq ?? 0) + 1;
        const extra_type = ['wide', 'noball', 'bye', 'legbye'].includes(b.extra_type) ? b.extra_type : null;
        check(await sb.from('balls').insert({
          match_id: m.id, innings: m.current_innings, seq,
          striker_id: b.striker_id, non_striker_id: b.non_striker_id, bowler_id: b.bowler_id,
          runs_off_bat: Math.max(0, int(b.runs_off_bat)), extra_type, extra_runs: Math.max(0, int(b.extra_runs)),
          is_legal: extra_type !== 'wide' && extra_type !== 'noball',
          wicket_type: b.wicket_type || null, out_player_id: b.wicket_type ? b.out_player_id : null,
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
        check(await sb.from('matches').update({ status: 'completed', result: clean(body.result) }).eq('id', body.match_id));
        return ok();
      }
      case 'reopenMatch': {
        check(await sb.from('matches').update({ status: 'live', result: null }).eq('id', body.match_id));
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
