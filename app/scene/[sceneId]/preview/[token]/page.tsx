import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ScenePlayer } from '@/components/scene-player';
import { parseRef, resolveAccess } from '@/lib/scenes/access';
import { getScene, scenesDb } from '@/lib/scenes/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scene preview', robots: { index: false } };

/** The working copy, for anyone with the preview link. */
export default async function ScenePreviewPage({ params }: { params: Promise<{ sceneId: string; token: string }> }) {
  const { sceneId, token } = await params;
  const scene = await getScene(scenesDb(), sceneId);
  const ref = parseRef(`p.${token}`);
  if (!scene || !ref || !resolveAccess(ref, scene, false)) notFound();
  return <ScenePlayer base={`/api/scenes/${scene.id}/files/p.${token}`} />;
}
