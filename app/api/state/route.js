import { NextResponse } from 'next/server';
import { db } from '@/lib/server';

export const dynamic = 'force-dynamic';

// Everything the home / teams pages need: teams, players, matches and slim ball rows for scores.
export async function GET() {
  try {
    const sb = db();
    const [teams, players, matches, balls] = await Promise.all([
      sb.from('teams').select('*').order('name'),
      sb.from('players').select('*').order('created_at'),
      sb.from('matches').select('*').order('created_at', { ascending: false }),
      sb.from('balls').select('match_id,innings,runs_off_bat,extra_runs,is_legal,wicket_type'),
    ]);
    const err = teams.error || players.error || matches.error || balls.error;
    if (err) throw err;
    return NextResponse.json({ teams: teams.data, players: players.data, matches: matches.data, balls: balls.data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
