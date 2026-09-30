import { NextResponse } from 'next/server';
import { getRole, loginWithPin } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return NextResponse.json({ role: getRole(request) });
}

export async function POST(request) {
  const { pin } = await request.json();
  const login = loginWithPin(pin);
  if (!login) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  const res = NextResponse.json({ role: login.role });
  res.cookies.set('session', login.token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ role: null });
  res.cookies.delete('session');
  return res;
}
