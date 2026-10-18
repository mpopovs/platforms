import 'server-only';

import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { customAlphabet } from 'nanoid';
import { emptyManifest, parseManifest, type SceneManifest } from '@claypixels/scene-engine/manifest';
import { resolveAccess, type SceneRef } from './access';

const id = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 14);
export const newSceneId = () => `scene_${id()}`;
export const newPreviewToken = () => randomBytes(18).toString('base64url');

export interface SceneRow {
  id: string;
  brand_id: string | null;
  name: string;
  draft: SceneManifest;
  draft_updated_at: string;
  published_version: number | null;
  preview_token: string;
  merch: { shirts?: boolean };
  created_at: string;
  updated_at: string;
}

/** Service-role client; callers check the admin role first. */
export function scenesDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });
}

export async function getScene(db: SupabaseClient, sceneId: string): Promise<SceneRow | null> {
  if (!/^scene_[a-z0-9]{6,32}$/.test(sceneId)) return null;
  const { data } = await db.from('scenes').select('*').eq('id', sceneId).maybeSingle();
  return (data as SceneRow | null) ?? null;
}

/** The manifest a ref points at, or null if missing or not allowed. */
export async function manifestFor(
  db: SupabaseClient,
  scene: SceneRow,
  ref: SceneRef,
  isAdmin: boolean
): Promise<SceneManifest | null> {
  const access = resolveAccess(ref, scene, isAdmin);
  if (!access) return null;
  if (access.source === 'draft') return parseManifest(scene.draft ?? emptyManifest());
  const { data } = await db
    .from('scene_versions')
    .select('manifest')
    .eq('scene_id', scene.id)
    .eq('version', access.version)
    .maybeSingle();
  return data ? parseManifest(data.manifest) : null;
}
