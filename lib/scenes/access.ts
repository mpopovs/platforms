/**
 * Who may read which version of a scene. Pure (tested).
 *
 * The engine reads files as `${base}/${name}`, where base is
 *   /api/scenes/<id>/files/<ref>
 * and ref is one of:
 *   draft        the working copy (admins only)
 *   p.<token>    the working copy through the preview link
 *   published    the published version (anyone, if the scene is published)
 *   v<n>         a specific version (admins; anyone if it is the published one)
 */

export type SceneRef =
  | { kind: 'draft' }
  | { kind: 'preview'; token: string }
  | { kind: 'published' }
  | { kind: 'version'; version: number };

export function parseRef(ref: string): SceneRef | null {
  if (ref === 'draft') return { kind: 'draft' };
  if (ref === 'published') return { kind: 'published' };
  const v = ref.match(/^v([1-9]\d{0,5})$/);
  if (v) return { kind: 'version', version: Number(v[1]) };
  const p = ref.match(/^p\.([A-Za-z0-9_-]{16,64})$/);
  if (p) return { kind: 'preview', token: p[1] };
  return null;
}

export interface SceneAccessInfo {
  preview_token: string;
  published_version: number | null;
}

/** What to load for a ref, or null when the caller may not see it. */
export function resolveAccess(
  ref: SceneRef,
  scene: SceneAccessInfo,
  isAdmin: boolean
): { source: 'draft' } | { source: 'version'; version: number } | null {
  switch (ref.kind) {
    case 'draft':
      return isAdmin ? { source: 'draft' } : null;
    case 'preview':
      return safeEqual(ref.token, scene.preview_token) ? { source: 'draft' } : null;
    case 'published':
      return scene.published_version ? { source: 'version', version: scene.published_version } : null;
    case 'version':
      return isAdmin || ref.version === scene.published_version ? { source: 'version', version: ref.version } : null;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Look a file name up in a manifest: inline JSON first, then stored files. */
export function resolveFile(
  manifest: { files: Record<string, string>; json: Record<string, unknown> },
  name: string
): { json: unknown } | { key: string } | null {
  if (Object.prototype.hasOwnProperty.call(manifest.json, name)) return { json: manifest.json[name] };
  if (Object.prototype.hasOwnProperty.call(manifest.files, name)) return { key: manifest.files[name] };
  return null;
}

/** Merge a patch into a manifest; null deletes a name. */
export function applyPatch<M extends { files: Record<string, string>; json: Record<string, unknown> }>(
  manifest: M,
  patch: { files?: Record<string, string | null>; json?: Record<string, unknown | null> }
): M {
  const files = { ...manifest.files };
  const json = { ...manifest.json };
  for (const [name, key] of Object.entries(patch.files ?? {})) {
    delete json[name];
    if (key === null) delete files[name];
    else files[name] = key;
  }
  for (const [name, value] of Object.entries(patch.json ?? {})) {
    delete files[name];
    if (value === null) delete json[name];
    else json[name] = value;
  }
  return { ...manifest, files, json };
}
