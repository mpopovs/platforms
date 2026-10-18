import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/server';
import { scenesDb, type SceneRow } from '@/lib/scenes/server';
import { createSceneAction } from './actions';
import { TEMPLATES } from '@/lib/scenes/templates';
import { SceneRowActions } from './scene-row-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scene editor' };

export default async function ScenesPage() {
  await requireRole(['admin']);
  const { data } = await scenesDb()
    .from('scenes')
    .select('id, name, published_version, draft_updated_at, preview_token, merch, created_at')
    .order('created_at', { ascending: false });
  const scenes = (data ?? []) as Pick<SceneRow, 'id' | 'name' | 'published_version' | 'draft_updated_at' | 'preview_token' | 'merch' | 'created_at'>[];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">Scene editor</h1>
        <p className="mt-1 text-gray-600">
          3D scenes and their stories for the consumer player: a hot spring, a fashion show, any environment. Edit the working copy, then publish a version.
        </p>

        <form action={createSceneAction} className="mt-6 flex flex-wrap gap-2">
          <input
            name="name"
            placeholder="New scene name"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2"
            maxLength={120}
          />
          <select name="template" defaultValue="fashion-show" className="rounded-lg border border-gray-300 bg-white px-3 py-2">
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}: {t.note}</option>
            ))}
          </select>
          <button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">Create scene</button>
        </form>
        <p className="mt-2 text-sm text-gray-500">
          To bring in a world folder with its models from the terminal, use <code>scripts/import-scene.ts</code> (see SCENES.md).
        </p>

        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          {scenes.length === 0 && <p className="p-6 text-gray-500">No scenes yet.</p>}
          {scenes.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4 last:border-0">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/scenes/${s.id}`} className="font-semibold text-gray-900 hover:underline">
                  {s.name}
                </Link>
                <div className="text-sm text-gray-500">
                  {s.published_version ? `Published v${s.published_version}` : 'Not published'}
                  {' · '}edited {new Date(s.draft_updated_at).toLocaleString('en-GB')}
                  {s.merch?.shirts ? ' · shirts on' : ''}
                </div>
              </div>
              <SceneRowActions id={s.id} previewToken={s.preview_token} published={Boolean(s.published_version)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
