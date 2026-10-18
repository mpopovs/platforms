import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ScenePlayer } from '@/components/scene-player';
import { getScene, scenesDb } from '@/lib/scenes/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ sceneId: string }> }): Promise<Metadata> {
  const scene = await getScene(scenesDb(), (await params).sceneId);
  return { title: scene?.name ?? 'Scene' };
}

/** The published version of a scene. */
export default async function ScenePage({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const scene = await getScene(scenesDb(), sceneId);
  if (!scene?.published_version) notFound();
  // Pin the version so an edit-and-publish while someone watches never mixes files.
  return <ScenePlayer base={`/api/scenes/${scene.id}/files/v${scene.published_version}`} />;
}
