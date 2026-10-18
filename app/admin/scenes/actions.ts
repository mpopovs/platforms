'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  INLINE_JSON_MAX_BYTES,
  contentTypeFor,
  isValidFileName,
  missingEssentials,
  parseManifest
} from '@claypixels/scene-engine/manifest';
import { requireRole } from '@/lib/auth/server';
import { applyPatch } from '@/lib/scenes/access';
import { getScene, newPreviewToken, newSceneId, scenesDb } from '@/lib/scenes/server';
import { templateManifest } from '@/lib/scenes/templates';
import { MAX_ASSET_BYTES, assetKey, keyBelongsToScene, sceneStorage, type UploadTarget } from '@/lib/scenes/storage';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

async function admin() {
  const { user } = await requireRole(['admin']);
  return { user, db: scenesDb() };
}

// ------------------------------------------------------------- scenes

export async function createSceneAction(formData: FormData) {
  const { user, db } = await admin();
  const name = String(formData.get('name') ?? '').trim().slice(0, 120) || 'Untitled scene';
  const template = String(formData.get('template') ?? 'fashion-show');
  const sceneId = newSceneId();
  const { error } = await db.from('scenes').insert({
    id: sceneId,
    name,
    brand_id: 'magicforms',
    draft: parseManifest(templateManifest(template)),
    preview_token: newPreviewToken(),
    created_by: user.id
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/scenes');
  redirect(`/admin/scenes/${sceneId}`);
}

export async function renameSceneAction(sceneId: string, name: string): Promise<Result> {
  const { db } = await admin();
  const clean = name.trim().slice(0, 120);
  if (!clean) return fail('Name cannot be empty');
  const { error } = await db.from('scenes').update({ name: clean }).eq('id', sceneId);
  if (error) return fail(error.message);
  revalidatePath('/admin/scenes');
  return { ok: true };
}

export async function deleteSceneAction(sceneId: string): Promise<Result> {
  const { db } = await admin();
  // Assets stay in storage (content-addressed, possibly shared); a cleanup
  // job can remove keys no manifest references.
  const { error } = await db.from('scenes').delete().eq('id', sceneId);
  if (error) return fail(error.message);
  revalidatePath('/admin/scenes');
  return { ok: true };
}

export async function regeneratePreviewTokenAction(sceneId: string): Promise<Result<{ token: string }>> {
  const { db } = await admin();
  const token = newPreviewToken();
  const { error } = await db.from('scenes').update({ preview_token: token }).eq('id', sceneId);
  if (error) return fail(error.message);
  return { ok: true, token };
}

export async function setSceneMerchAction(sceneId: string, shirts: boolean): Promise<Result> {
  const { db } = await admin();
  const scene = await getScene(db, sceneId);
  if (!scene) return fail('Scene not found');
  const { error } = await db.from('scenes').update({ merch: { ...scene.merch, shirts } }).eq('id', sceneId);
  if (error) return fail(error.message);
  return { ok: true };
}

// ------------------------------------------------------------- files

const uploadRequest = z.array(
  z.object({
    name: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive().max(MAX_ASSET_BYTES)
  })
).min(1).max(50);

/**
 * Step 1 of saving a file: the browser sends name + sha256 + size, we answer
 * with where to put the bytes (or null when that content is already stored).
 */
export async function prepareUploadsAction(
  sceneId: string,
  files: { name: string; sha256: string; size: number }[]
): Promise<Result<{ uploads: { name: string; key: string; contentType: string; target: UploadTarget | null }[] }>> {
  const { db } = await admin();
  const parsed = uploadRequest.safeParse(files);
  if (!parsed.success) return fail('Invalid upload request');
  if (!(await getScene(db, sceneId))) return fail('Scene not found');
  const storage = sceneStorage();
  const uploads = [];
  for (const f of parsed.data) {
    if (!isValidFileName(f.name)) return fail(`Invalid file name: ${f.name}`);
    const key = assetKey(sceneId, f.sha256, f.name);
    const contentType = contentTypeFor(f.name);
    const target = (await storage.exists(key)) ? null : await storage.uploadTarget(key, contentType);
    uploads.push({ name: f.name, key, contentType, target });
  }
  return { ok: true, uploads };
}

/**
 * Step 2: point names in the draft at stored keys and/or set inline JSON.
 * null removes a name.
 */
export async function updateDraftAction(
  sceneId: string,
  patch: { files?: Record<string, string | null>; json?: Record<string, unknown | null> }
): Promise<Result<{ savedAt: string }>> {
  const { db } = await admin();

  for (const [name, key] of Object.entries(patch.files ?? {})) {
    if (!isValidFileName(name)) return fail(`Invalid file name: ${name}`);
    if (key !== null && !keyBelongsToScene(key, sceneId)) return fail(`Invalid storage key for ${name}`);
  }
  for (const [name, value] of Object.entries(patch.json ?? {})) {
    if (!isValidFileName(name)) return fail(`Invalid file name: ${name}`);
    if (value !== null && JSON.stringify(value).length > INLINE_JSON_MAX_BYTES) return fail(`${name} is too large to keep inline`);
  }

  // Optimistic concurrency: only write if nobody saved in between; else
  // re-read and apply the patch again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const scene = await getScene(db, sceneId);
    if (!scene) return fail('Scene not found');
    let next;
    try {
      next = parseManifest(applyPatch(parseManifest(scene.draft), patch));
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Invalid scene');
    }
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('scenes')
      .update({ draft: next, draft_updated_at: now })
      .eq('id', sceneId)
      .eq('draft_updated_at', scene.draft_updated_at)
      .select('id');
    if (error) return fail(error.message);
    if (data?.length) return { ok: true, savedAt: now };
  }
  return fail('The scene was being saved from somewhere else; try again');
}

// ------------------------------------------------------------- publish

export async function publishSceneAction(sceneId: string, note?: string): Promise<Result<{ version: number }>> {
  const { user, db } = await admin();
  const scene = await getScene(db, sceneId);
  if (!scene) return fail('Scene not found');
  const draft = parseManifest(scene.draft);
  const missing = missingEssentials(draft);
  if (missing.length) return fail(`The scene is missing ${missing.join(', ')}`);

  const { data: last } = await db
    .from('scene_versions')
    .select('version')
    .eq('scene_id', sceneId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;

  const ins = await db.from('scene_versions').insert({
    scene_id: sceneId,
    version,
    manifest: draft,
    note: note?.slice(0, 500) || null,
    created_by: user.id
  });
  if (ins.error) return fail(ins.error.message); // a parallel publish took this number
  const up = await db.from('scenes').update({ published_version: version }).eq('id', sceneId);
  if (up.error) return fail(up.error.message);
  revalidatePath('/admin/scenes');
  return { ok: true, version };
}

/** Make an older version the published one again. */
export async function setPublishedVersionAction(sceneId: string, version: number | null): Promise<Result> {
  const { db } = await admin();
  if (version !== null) {
    const { data } = await db.from('scene_versions').select('version').eq('scene_id', sceneId).eq('version', version).maybeSingle();
    if (!data) return fail('Version not found');
  }
  const { error } = await db.from('scenes').update({ published_version: version }).eq('id', sceneId);
  if (error) return fail(error.message);
  revalidatePath('/admin/scenes');
  return { ok: true };
}
