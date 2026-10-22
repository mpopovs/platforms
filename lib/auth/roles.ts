/**
 * Roles and admin-area access rules.
 *
 * Pure functions only (no Next.js or Supabase imports) so they can run in
 * middleware, server actions, route handlers and unit tests alike.
 *
 * The role lives in `public.profiles.role` and is mirrored into
 * `auth.users.raw_app_meta_data.role` by a database trigger (see
 * supabase/migrations/20261016000001_create_profiles_and_roles.sql), so it
 * arrives on `user.app_metadata` without an extra query. Users cannot edit
 * app_metadata themselves, unlike user_metadata.
 */

export const ROLES = [
  'admin',
  'sub_admin',
  'teacher',
  'museum',
  'parent',
  'guest'
] as const;

export type Role = (typeof ROLES)[number];

/** Capabilities a sub-admin can be granted, each unlocking part of /admin. */
export const CAPABILITIES = ['orders', 'print', 'moderation'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Admin paths each capability unlocks for a sub-admin. */
const CAPABILITY_PATHS: Record<Capability, string[]> = {
  orders: ['/admin/orders'],
  print: ['/admin/print'],
  moderation: ['/admin/moderation']
};

export interface RoleClaims {
  role: Role | null;
  capabilities: Capability[];
}

type UserLike = { app_metadata?: Record<string, unknown> | null } | null | undefined;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
}

/** Read role and capabilities from a Supabase user's app_metadata. */
export function getRoleClaims(user: UserLike): RoleClaims {
  const meta = user?.app_metadata ?? {};
  const role = isRole(meta.role) ? meta.role : null;
  const raw = Array.isArray(meta.capabilities) ? meta.capabilities : [];
  return { role, capabilities: raw.filter(isCapability) };
}

/** Whether the role may enter the /admin area at all. */
export function isStaffRole(role: Role | null): boolean {
  return role === 'admin' || role === 'sub_admin';
}

function matchesPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + '/');
}

/**
 * Whether these claims may open a given /admin path.
 * - admin: everything
 * - sub_admin: the /admin landing page plus the paths their capabilities unlock
 * - everyone else: nothing
 */
export function canAccessAdminPath(claims: RoleClaims, pathname: string): boolean {
  if (claims.role === 'admin') return true;
  if (claims.role !== 'sub_admin') return false;
  if (pathname === '/admin' || pathname === '/admin/') return true;
  return claims.capabilities.some((cap) =>
    CAPABILITY_PATHS[cap].some((base) => matchesPath(pathname, base))
  );
}

/** Whether these claims hold one of the given roles. */
export function hasRole(claims: RoleClaims, allowed: readonly Role[]): boolean {
  return claims.role !== null && allowed.includes(claims.role);
}
