'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneHandle } from '@claypixels/scene-engine';
import { sha256Hex, uploadToTarget } from '@/lib/scenes/upload-client';
import {
  prepareUploadsAction,
  publishSceneAction,
  regeneratePreviewTokenAction,
  setSceneMerchAction,
  updateDraftAction
} from '../actions';

const INLINE_JSON_MAX = 512 * 1024;
const SKIP = /(^|\/)(\.|__pycache__\/)|\.bak$|\.pyc$/;

type Item = { name: string; blob: Blob };

/** Files from a picked folder, named relative to that folder. */
function folderItems(list: FileList, map: (rel: string) => string | null): Item[] {
  const out: Item[] = [];
  for (const f of Array.from(list)) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/');
    if (!rel || SKIP.test(rel)) continue;
    const name = map(rel);
    if (name) out.push({ name, blob: f });
  }
  return out;
}

export function SceneEditor(props: {
  sceneId: string;
  name: string;
  previewToken: string;
  publishedVersion: number | null;
  shirts: boolean;
  hasScene: boolean;
}) {
  const { sceneId } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountKey, setMountKey] = useState(0);
  const [hasScene, setHasScene] = useState(props.hasScene);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(props.publishedVersion);
  const [token, setToken] = useState(props.previewToken);
  const [shirts, setShirts] = useState(props.shirts);
  const [panel, setPanel] = useState<null | 'files' | 'consumer'>(null);

  /** Store files: inline small JSON, upload the rest straight to storage. */
  const saveItems = useCallback(
    async (items: Item[], onProgress?: (done: number, total: number) => void) => {
      const json: Record<string, unknown> = {};
      const blobs: Item[] = [];
      for (const it of items) {
        if (it.name.endsWith('.json') && it.blob.size <= INLINE_JSON_MAX) {
          try {
            json[it.name] = JSON.parse(await it.blob.text());
            continue;
          } catch {
            /* not valid JSON: store as a file */
          }
        }
        blobs.push(it);
      }

      const files: Record<string, string> = {};
      let done = 0;
      for (let i = 0; i < blobs.length; i += 25) {
        const batch = blobs.slice(i, i + 25);
        const meta = await Promise.all(batch.map(async (b) => ({ name: b.name, sha256: await sha256Hex(b.blob), size: b.blob.size })));
        const prep = await prepareUploadsAction(sceneId, meta);
        if (!prep.ok) throw new Error(prep.error);
        for (const u of prep.uploads) {
          const item = batch.find((b) => b.name === u.name)!;
          if (u.target) await uploadToTarget(u.target, item.blob, u.contentType);
          files[u.name] = u.key;
          onProgress?.(++done, blobs.length);
        }
      }

      const res = await updateDraftAction(sceneId, { files, json });
      if (!res.ok) throw new Error(res.error);
      return res.savedAt;
    },
    [sceneId]
  );

  // Mount the engine (again after a folder upload)
  useEffect(() => {
    if (!hasScene || !hostRef.current) return;
    let handle: SceneHandle | null = null;
    let cancelled = false;
    const host = hostRef.current;
    import('@claypixels/scene-engine').then(async ({ mountScene }) => {
      if (cancelled) return;
      handle = await mountScene(host, {
        base: `/api/scenes/${sceneId}/files/draft`,
        edit: true,
        saveFile: async (name, body, type) => {
          const blob = typeof body === 'string' ? new Blob([body], { type }) : body;
          const at = await saveItems([{ name, blob }]);
          return new Date(at).toLocaleTimeString('en-GB');
        }
      });
      if (cancelled) handle.destroy();
    });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [hasScene, mountKey, sceneId, saveItems]);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setStatus(label);
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function uploadFolder(list: FileList | null, kind: 'world' | 'capys') {
    if (!list?.length) return;
    const items =
      kind === 'world'
        ? folderItems(list, (rel) => rel)
        : folderItems(list, (rel) => (/^[^/]+\/[^/]+_capy_v2\.glb$/.test(rel) ? `capys/${rel}` : null));
    if (!items.length) {
      setStatus(kind === 'capys' ? 'No <tag>/<tag>_capy_v2.glb files in that folder' : 'That folder is empty');
      return;
    }
    if (kind === 'world' && !items.some((i) => i.name === 'scene.json')) {
      setStatus('Pick the world folder itself: it must contain scene.json');
      return;
    }
    run(`Uploading ${items.length} files…`, async () => {
      await saveItems(items, (d, t) => setStatus(`Uploading ${d}/${t}…`));
      setHasScene(true);
      setMountKey((k) => k + 1);
      return `Saved ${items.length} files to the working copy`;
    });
  }

  const previewUrl = `/scene/${sceneId}/preview/${token}`;

  return (
    <div className="fixed inset-0 bg-[#cdd6e0]">
      <div ref={hostRef} key={mountKey} className="absolute inset-0" />

      {!hasScene && (
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className="max-w-md rounded-2xl bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">{props.name} has no files yet</h2>
            <p className="mt-2 text-sm text-gray-600">
              Upload a world folder (the one with <code>scene.json</code>, the backdrop and splats), then the capybaras folder.
            </p>
            <FolderButton label="Upload world folder" disabled={busy} onPick={(l) => uploadFolder(l, 'world')} />
            {status && <p className="mt-3 text-sm text-gray-700">{status}</p>}
          </div>
        </div>
      )}

      <div className="absolute right-3 top-3 z-30 flex max-w-[calc(100vw-340px)] flex-col items-end gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-xl bg-[rgba(20,26,34,.92)] p-1.5 text-[#e8eef5] shadow-lg">
          <Link href="/admin/scenes" className="rounded-md px-2.5 py-1.5 hover:bg-white/10">← Scenes</Link>
          <span className="px-1 font-semibold">{props.name}</span>
          <span className="px-1 text-[#9fb2c6]">{published ? `live: v${published}` : 'not published'}</span>
          <button className={btn(panel === 'files')} onClick={() => setPanel(panel === 'files' ? null : 'files')}>Files</button>
          <button className={btn(panel === 'consumer')} onClick={() => setPanel(panel === 'consumer' ? null : 'consumer')}>Consumer</button>
          <a href={previewUrl} target="_blank" className={btn(false)}>Preview ↗</a>
          <button
            disabled={busy || !hasScene}
            className="rounded-md bg-[#2f7d4f] px-3 py-1.5 font-semibold hover:bg-[#3f9a64] disabled:opacity-50"
            onClick={() =>
              run('Publishing…', async () => {
                const note = window.prompt('What changed? (optional)') ?? undefined;
                const r = await publishSceneAction(sceneId, note);
                if (!r.ok) throw new Error(r.error);
                setPublished(r.version);
                return `Published v${r.version}`;
              })
            }
          >
            Publish
          </button>
        </div>

        {panel === 'files' && (
          <div className="w-80 rounded-xl bg-[rgba(20,26,34,.92)] p-3 text-[#e8eef5] shadow-lg">
            <p className="text-[#9fb2c6]">Replace or add files in the working copy. Unchanged files are not uploaded again.</p>
            <FolderButton label="Upload world folder" disabled={busy} onPick={(l) => uploadFolder(l, 'world')} dark />
            <FolderButton label="Upload capybaras folder" disabled={busy} onPick={(l) => uploadFolder(l, 'capys')} dark />
            <p className="mt-2 text-xs text-[#9fb2c6]">Capybaras: pick the animations folder; only &lt;tag&gt;/&lt;tag&gt;_capy_v2.glb files are taken. Single layers can be swapped in the editor’s own Files tab.</p>
          </div>
        )}

        {panel === 'consumer' && (
          <div className="w-80 rounded-xl bg-[rgba(20,26,34,.92)] p-3 text-[#e8eef5] shadow-lg">
            <label className="flex items-center justify-between gap-3">
              <span>
                Offer T-shirts
                <span className="block text-xs text-[#9fb2c6]">Shows “Put this on a T-shirt” after an upload in this scene.</span>
              </span>
              <input
                type="checkbox"
                checked={shirts}
                disabled={busy}
                onChange={(e) => {
                  const on = e.target.checked;
                  run('Saving…', async () => {
                    const r = await setSceneMerchAction(sceneId, on);
                    if (!r.ok) throw new Error(r.error);
                    setShirts(on);
                    return on ? 'T-shirts on for this scene' : 'T-shirts off for this scene';
                  });
                }}
                className="size-5"
              />
            </label>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-xs text-[#9fb2c6]">Preview link (shows the working copy to anyone who has it):</p>
              <code className="mt-1 block break-all text-xs">{previewUrl}</code>
              <button
                className="mt-2 rounded-md bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20"
                disabled={busy}
                onClick={() =>
                  run('Making a new link…', async () => {
                    const r = await regeneratePreviewTokenAction(sceneId);
                    if (!r.ok) throw new Error(r.error);
                    setToken(r.token);
                    return 'New preview link made; the old one stops working';
                  })
                }
              >
                Make a new preview link
              </button>
            </div>
          </div>
        )}

        {status && hasScene && (
          <div className="rounded-lg bg-[rgba(20,26,34,.92)] px-3 py-1.5 text-[#8fe3a8] shadow">{status}</div>
        )}
      </div>
    </div>
  );
}

function btn(on: boolean) {
  return `rounded-md px-2.5 py-1.5 ${on ? 'bg-[#3d6b96]' : 'bg-white/10 hover:bg-white/20'}`;
}

function FolderButton({ label, onPick, disabled, dark }: { label: string; onPick: (l: FileList | null) => void; disabled?: boolean; dark?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('webkitdirectory', '');
    ref.current?.setAttribute('directory', '');
  }, []);
  return (
    <label
      className={`mt-3 block cursor-pointer rounded-lg px-3 py-2 text-center font-medium ${
        dark ? 'bg-white/10 hover:bg-white/20' : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {label}
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}
