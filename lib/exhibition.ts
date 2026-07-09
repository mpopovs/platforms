import { customAlphabet } from 'nanoid';
import { supabase } from './supabase';
import {
  ExhibitionConfig,
  ExhibitionConfigRow,
  GridLayout,
  ExhibitionCellConfig,
  ExhibitionTunables,
  DEFAULT_EXHIBITION_TUNABLES,
  generateExhibitionConfigId,
} from './types/exhibition';

// URL-safe, high-entropy token for the unauthenticated /exhibition show route.
// 32 chars from a 64-char alphabet ~= 192 bits of entropy — effectively unguessable.
const generateToken = customAlphabet(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
  32
);

export function generateExhibitionAccessToken(): string {
  return generateToken();
}

function rowToConfig(row: ExhibitionConfigRow): ExhibitionConfig {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    layout: row.config.layout,
    cells: row.config.cells,
    tunables: { ...DEFAULT_EXHIBITION_TUNABLES, ...row.config.tunables },
    accessToken: row.access_token,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * Create a new exhibition config. Returns the created config plus its
 * access token (the token is only ever returned here and from
 * regenerateExhibitionAccessToken — callers must persist it themselves if
 * they need to display/copy the show URL again later).
 */
export async function createExhibitionConfig(
  userId: string,
  name: string,
  layout: GridLayout,
  cells: ExhibitionCellConfig[],
  tunables: Partial<ExhibitionTunables> = {},
  supabaseClient?: any
): Promise<{ config: ExhibitionConfig; accessToken: string }> {
  const client = supabaseClient || supabase;
  const id = generateExhibitionConfigId();
  const accessToken = generateExhibitionAccessToken();
  const mergedTunables = { ...DEFAULT_EXHIBITION_TUNABLES, ...tunables };

  const { data, error } = await client
    .from('exhibition_configs')
    .insert({
      id,
      user_id: userId,
      name,
      config: { layout, cells, tunables: mergedTunables },
      access_token: accessToken,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create exhibition config: ${error?.message || 'unknown error'}`);
  }

  return { config: rowToConfig(data as ExhibitionConfigRow), accessToken };
}

/** Fetch a config by id — caller must verify ownership (compare userId) before returning it to the client. */
export async function getExhibitionConfigById(id: string, supabaseClient?: any): Promise<ExhibitionConfig | null> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('exhibition_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return rowToConfig(data as ExhibitionConfigRow);
}

/**
 * Fetch a config by its public access token — used by the unauthenticated
 * /exhibition show route. No ownership check needed: possession of the
 * token IS the authorization.
 */
export async function getExhibitionConfigByToken(accessToken: string, supabaseClient?: any): Promise<ExhibitionConfig | null> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('exhibition_configs')
    .select('*')
    .eq('access_token', accessToken)
    .single();

  if (error || !data) return null;
  return rowToConfig(data as ExhibitionConfigRow);
}

export async function listExhibitionConfigsForUser(userId: string, supabaseClient?: any): Promise<ExhibitionConfig[]> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('exhibition_configs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    console.error('Error fetching exhibition configs:', error);
    return [];
  }

  return (data as ExhibitionConfigRow[]).map(rowToConfig);
}

/** Update a config's layout/cells/tunables and/or name. Ownership must be verified by the caller first. */
export async function updateExhibitionConfig(
  id: string,
  updates: {
    name?: string;
    layout?: GridLayout;
    cells?: ExhibitionCellConfig[];
    tunables?: Partial<ExhibitionTunables>;
  },
  supabaseClient?: any
): Promise<ExhibitionConfig | null> {
  const client = supabaseClient || supabase;

  const existing = await getExhibitionConfigById(id, client);
  if (!existing) return null;

  const patch: Record<string, any> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.layout || updates.cells || updates.tunables) {
    patch.config = {
      layout: updates.layout ?? existing.layout,
      cells: updates.cells ?? existing.cells,
      tunables: { ...existing.tunables, ...updates.tunables },
    };
  }

  const { data, error } = await client
    .from('exhibition_configs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update exhibition config: ${error?.message || 'unknown error'}`);
  }

  return rowToConfig(data as ExhibitionConfigRow);
}

/** Issues a new access token, invalidating the old show URL. Ownership must be verified by the caller first. */
export async function regenerateExhibitionAccessToken(id: string, supabaseClient?: any): Promise<string> {
  const client = supabaseClient || supabase;
  const accessToken = generateExhibitionAccessToken();

  const { error } = await client
    .from('exhibition_configs')
    .update({ access_token: accessToken })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to regenerate access token: ${error.message}`);
  }

  return accessToken;
}

/** Ownership must be verified by the caller first. */
export async function deleteExhibitionConfig(id: string, supabaseClient?: any): Promise<void> {
  const client = supabaseClient || supabase;
  const { error } = await client
    .from('exhibition_configs')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete exhibition config: ${error.message}`);
  }
}
