import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const PIN_ENV = { admin: 'ADMIN_PIN', umpire: 'UMPIRE_PIN' };

// Cookie value derived from the PIN; the PIN itself never leaves the server.
function tokenFor(role) {
  const pin = process.env[PIN_ENV[role]];
  if (!pin) return null;
  return createHash('sha256').update(`vayuz-cricket:${role}:${pin}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex');
}

// Returns { role, token } for a PIN, or null.
export function loginWithPin(pin) {
  for (const role of Object.keys(PIN_ENV)) {
    if (process.env[PIN_ENV[role]] && String(pin) === process.env[PIN_ENV[role]]) return { role, token: tokenFor(role) };
  }
  return null;
}

// 'admin' | 'umpire' | null
export function getRole(request) {
  const c = request.cookies.get('session')?.value;
  if (!c) return null;
  for (const role of Object.keys(PIN_ENV)) if (tokenFor(role) === c) return role;
  return null;
}
