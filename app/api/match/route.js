import { NextResponse } from 'next/server';
import { db } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const sb = db();
    const { data: match, error } = await sb.from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    const [balls, players, teams] = await Promise.all([
      sb.from('balls').select('*').eq('match_id', id).order('innings').order('seq'),
      sb.from('players').select('*').in('team_id', [match.team_a, match.team_b]).order('created_at'),
      sb.from('teams').select('*').in('id', [match.team_a, match.team_b]),
    ]);
    const err = balls.error || players.error || teams.error;
    if (err) throw err;
    return NextResponse.json({ match, balls: balls.data, players: players.data, teams: teams.data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
