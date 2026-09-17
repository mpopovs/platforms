'use client';

import { useEffect, useState } from 'react';
import type { ExhibitionConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { getIsOnline } from '@/lib/connectivity-monitor';
import { deleteStaleCachedAssets, storeModel, storeTexture, touchCachedAsset } from '@/lib/texture-cache';
import {
  EXHIBITION_OFFLINE_RETENTION_MS,
  deleteSnapshotsOlderThan,
  fetchWithTimeout,
} from '@/lib/exhibition-offline-store';
import { collectExhibitionAssets, type ExhibitionAsset } from './exhibition-assets';
import { useIsOnline } from './use-is-online';
import { ConnectionIndicator, type ConnectionState } from './connection-indicator';

/** Re-mark saved files as in use at most this often (each refresh rewrites the record). */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Re-check everything periodically so a long-running show keeps its files marked as in use. */
const RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
/**
 * Wait this long after a clean pass before deleting anything, then re-check
 * the connection: right after an offline page load the monitor still reports
 * "online" until its first probe fails, and cleanup must never run offline.
 */
const CLEANUP_DELAY_MS = 60 * 1000;
const ASSET_FETCH_TIMEOUT_MS = 120 * 1000;
const SYNC_CONCURRENCY = 2;

/** Makes sure one file is in the IndexedDB cache (downloading it if needed) and marked as in use. */
async function saveAsset(asset: ExhibitionAsset, onDownloadStart: () => void): Promise<boolean> {
  try {
    if (await touchCachedAsset(asset.kind, asset.url, TOUCH_INTERVAL_MS)) return true;
    onDownloadStart();
    const res = await fetchWithTimeout(asset.url, ASSET_FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (asset.kind === 'model') await storeModel(asset.url, blob, asset.modelId);
    else await storeTexture(asset.url, blob, asset.modelId, asset.textureId);
    return true;
  } catch (err) {
    console.warn('[ExhibitionOffline] Could not save for offline use:', asset.url, err);
    return false;
  }
}

interface SyncProgress {
  total: number;
  /** Files confirmed in the cache during the latest pass. */
  saved: number;
  /** Downloads started by the running pass (0 once it finishes). */
  pending: number;
  failed: number;
  /** A pass has finished at least once (until then, nothing is known to be saved). */
  checked: boolean;
}

/**
 * While online, downloads every model and texture the exhibition can show
 * into the browser's IndexedDB cache (the one Model3D reads from), so the
 * show keeps working through a lost connection — only uploads made while
 * offline won't appear. Re-runs whenever the data changes (e.g. a new upload),
 * every few hours, and a minute after a failed download.
 *
 * After a fully successful pass it removes this exhibition's cached files and
 * offline data copies that nothing has used for EXHIBITION_OFFLINE_RETENTION_MS
 * (7 days). Nothing is ever deleted while offline.
 */
export function useExhibitionOfflineSync(
  config: ExhibitionConfig,
  modelsById: Record<string, ViewerModelWithAllTextures>,
  snapshotKeysInUse: string[],
  enabled: boolean
): { state: ConnectionState; title: string } {
  const online = useIsOnline();
  const [progress, setProgress] = useState<SyncProgress>({ total: 0, saved: 0, pending: 0, failed: 0, checked: false });
  const [resyncTick, setResyncTick] = useState(0);
  const keysInUse = snapshotKeysInUse.join('\n');

  useEffect(() => {
    // Ask the browser not to evict this site's storage under disk pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !online) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const assets = collectExhibitionAssets(config, modelsById);

    (async () => {
      let saved = 0;
      let failed = 0;
      let downloadsStarted = 0;
      let cursor = 0;
      const publish = (checked: boolean) => {
        if (cancelled) return;
        setProgress((prev) => ({
          total: assets.length,
          saved,
          pending: checked ? 0 : downloadsStarted,
          failed,
          checked: checked || prev.checked,
        }));
      };

      async function worker() {
        while (!cancelled && cursor < assets.length) {
          const asset = assets[cursor++];
          const ok = await saveAsset(asset, () => {
            downloadsStarted++;
            publish(false);
          });
          if (ok) saved++;
          else failed++;
        }
      }
      await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, worker));
      if (cancelled) return;
      publish(true);

      if (failed > 0) {
        timers.push(setTimeout(() => setResyncTick((t) => t + 1), RETRY_AFTER_FAILURE_MS));
        return;
      }
      timers.push(
        setTimeout(() => {
          if (!getIsOnline()) return;
          const modelIds = Array.from(new Set(assets.map((a) => a.modelId)));
          deleteStaleCachedAssets(modelIds, new Set(assets.map((a) => a.url)), EXHIBITION_OFFLINE_RETENTION_MS).catch((err) =>
            console.warn('[ExhibitionOffline] Cache cleanup failed:', err)
          );
          deleteSnapshotsOlderThan(EXHIBITION_OFFLINE_RETENTION_MS, new Set(keysInUse.split('\n'))).catch((err) =>
            console.warn('[ExhibitionOffline] Offline data cleanup failed:', err)
          );
        }, CLEANUP_DELAY_MS),
        setTimeout(() => setResyncTick((t) => t + 1), RESYNC_INTERVAL_MS)
      );
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [enabled, online, config, modelsById, keysInUse, resyncTick]);

  if (!online) {
    return { state: 'offline', title: 'Offline — showing saved content. New uploads will appear when the connection returns.' };
  }
  if (!progress.checked || progress.pending > 0) {
    return { state: 'saving', title: `Online — saving content for offline use (${progress.saved}/${progress.total})` };
  }
  if (progress.failed > 0) {
    return { state: 'saving', title: `Online — ${progress.failed} file(s) not saved for offline use yet, retrying` };
  }
  return { state: 'online', title: `Online — all content saved for offline use (${progress.total} files)` };
}

/**
 * Runs the offline sync for the show page and renders the corner indicator
 * when enabled. Kept as its own component so progress updates re-render only
 * this, not the whole grid.
 */
export function ExhibitionOfflineSync({
  config,
  modelsById,
  snapshotKeysInUse,
  enabled,
}: {
  config: ExhibitionConfig;
  modelsById: Record<string, ViewerModelWithAllTextures>;
  snapshotKeysInUse: string[];
  enabled: boolean;
}) {
  const { state, title } = useExhibitionOfflineSync(config, modelsById, snapshotKeysInUse, enabled);
  return config.showConnectionIndicator ? <ConnectionIndicator state={state} title={title} /> : null;
}
