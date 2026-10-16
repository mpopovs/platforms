import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getRoleClaims, hasRole, type Role } from './roles';

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Returns the signed-in user only if they hold one of `allowed` roles,
 * otherwise null. Drop-in replacement for
 *   const { data: { user } } = await supabase.auth.getUser();
 * in code that already handles `!user` as "not authorised".
 *
 * Server actions are callable from any page by their action id, so the
 * /admin middleware check alone does not protect them: every staff action
 * and staff API route must call this (or requireRole) itself.
 */
export async function getUserWithRole(
  supabase: SupabaseClient,
  allowed: readonly Role[] = ['admin']
): Promise<User | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  return hasRole(getRoleClaims(user), allowed) ? user : null;
}

/** Shorthand for the full-admin check used by the existing admin tools. */
export function getAdminUser(supabase: SupabaseClient): Promise<User | null> {
  return getUserWithRole(supabase, ['admin']);
}

/**
 * Throwing variant for new code: returns the user and a client, or throws
 * AuthorizationError (401 when signed out, 403 when the role is wrong).
 */
export async function requireRole(
  allowed: readonly Role[],
  supabase?: SupabaseClient
): Promise<{ user: User; supabase: SupabaseClient }> {
  const client = supabase ?? (await createClient());
  const {
    data: { user }
  } = await client.auth.getUser();
  if (!user) throw new AuthorizationError('Not signed in', 401);
  if (!hasRole(getRoleClaims(user), allowed)) {
    throw new AuthorizationError('Not allowed', 403);
  }
  return { user, supabase: client };
}
