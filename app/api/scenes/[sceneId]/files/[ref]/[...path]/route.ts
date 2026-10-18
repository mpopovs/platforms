import { NextRequest, NextResponse } from 'next/server';
import { isValidFileName } from '@claypixels/scene-engine/manifest';
import { parseRef, resolveFile } from '@/lib/scenes/access';
import { getScene, manifestFor, scenesDb } from '@/lib/scenes/server';
import { sceneStorage } from '@/lib/scenes/storage';
import { getUserWithRole } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/scenes/:sceneId/files/:ref/:path*
 * The engine reads every scene file through here. Inline JSON is returned
 * directly; stored assets redirect to their content-addressed public URL.
 * Responses are not cached: the draft changes as you edit.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sceneId: string; ref: string; path: string[] }> }
) {
  const { sceneId, ref: rawRef, path } = await params;
  const ref = parseRef(rawRef);
  const name = path.join('/');
  if (!ref || !isValidFileName(name)) return notFound();

  const db = scenesDb();
  const scene = await getScene(db, sceneId);
  if (!scene) return notFound();

  const needsAdmin = ref.kind === 'draft' || (ref.kind === 'version' && ref.version !== scene.published_version);
  const isAdmin = needsAdmin ? Boolean(await getUserWithRole(await createClient(), ['admin'])) : false;

  const manifest = await manifestFor(db, scene, ref, isAdmin);
  if (!manifest) return notFound();

  const hit = resolveFile(manifest, name);
  if (!hit) return notFound();
  if ('json' in hit) {
    return NextResponse.json(hit.json, { headers: { 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(null, {
    status: 302,
    headers: { Location: sceneStorage().publicUrl(hit.key), 'Cache-Control': 'no-store' }
  });
}

function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
