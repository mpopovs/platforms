import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/server';
import { getScene, scenesDb } from '@/lib/scenes/server';
import { SceneEditor } from './scene-editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scene editor' };

export default async function SceneEditorPage({ params }: { params: Promise<{ sceneId: string }> }) {
  await requireRole(['admin']);
  const { sceneId } = await params;
  const scene = await getScene(scenesDb(), sceneId);
  if (!scene) notFound();
  const hasScene = 'scene.json' in scene.draft.json || 'scene.json' in scene.draft.files;
  return (
    <SceneEditor
      sceneId={scene.id}
      name={scene.name}
      previewToken={scene.preview_token}
      publishedVersion={scene.published_version}
      shirts={Boolean(scene.merch?.shirts)}
      hasScene={hasScene}
    />
  );
}
