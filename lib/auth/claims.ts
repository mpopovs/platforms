/**
 * The role of a signed-in user, robust against setup gaps so existing
 * admins never get locked out:
 *
 *  1. ADMIN_EMAILS (comma-separated env) are always admin. Emergency key.
 *  2. role in app_metadata (set by the profiles trigger) when present.
 *  3. otherwise the profiles table (service key).
 *  4. if the profiles table does not exist yet (roles SQL not applied to
 *     this database), keep the old behaviour: any signed-in user is admin.
 *
 * Used by the proxy (middleware) and by server actions / API routes.
 * No `server-only` import so the proxy can use it.
 */
import { createClient } from '@supabase/supabase-js';
import { getRoleClaims, isCapability, isRole, type RoleClaims } from './roles';

type UserLike = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null };

export function adminEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export type ClaimsSource = 'admin-emails' | 'app-metadata' | 'profiles' | 'legacy-no-roles-table' | 'none';

export async function resolveClaims(user: UserLike): Promise<RoleClaims & { source: ClaimsSource }> {
  const email = user.email?.toLowerCase();
  if (email && adminEmails().includes(email)) return { role: 'admin', capabilities: [], source: 'admin-emails' };

  const fromJwt = getRoleClaims(user);
  if (fromJwt.role) return { ...fromJwt, source: 'app-metadata' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { role: null, capabilities: [], source: 'none' };

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from('profiles').select('role, capabilities').eq('id', user.id).maybeSingle();
  if (error) {
    // 42P01 (Postgres) / PGRST205 (PostgREST): table does not exist yet
    if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)) {
      console.warn('[auth] profiles table missing: treating signed-in users as admin until the roles SQL is applied');
      return { role: 'admin', capabilities: [], source: 'legacy-no-roles-table' };
    }
    console.error('[auth] profiles lookup failed', error.message);
    return { role: null, capabilities: [], source: 'none' };
  }
  if (data && isRole(data.role)) {
    const caps = Array.isArray(data.capabilities) ? data.capabilities.filter(isCapability) : [];
    return { role: data.role, capabilities: caps, source: 'profiles' };
  }
  return { role: null, capabilities: [], source: 'none' };
}
