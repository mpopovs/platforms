'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { deleteSceneAction } from './actions';

export function SceneRowActions({ id, previewToken, published }: { id: string; previewToken: string; published: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2 text-sm">
      <Link href={`/admin/scenes/${id}`} className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">Edit</Link>
      <a href={`/scene/${id}/preview/${previewToken}`} target="_blank" className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">Preview</a>
      {published && (
        <a href={`/scene/${id}`} target="_blank" className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50">Published</a>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (window.prompt('Type DELETE to delete this scene and all its versions') !== 'DELETE') return;
          start(async () => {
            const r = await deleteSceneAction(id);
            if (!r.ok) window.alert(r.error);
          });
        }}
        className="rounded-md border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
