'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExhibitionCellConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { getIsOnline, subscribeConnectivity } from '@/lib/connectivity-monitor';
import { fetchWithTimeout, loadSnapshot, saveSnapshot, viewerDataSnapshotKey } from '@/lib/exhibition-offline-store';

const DATA_FETCH_TIMEOUT_MS = 15_000;
/** Re-save an unchanged viewer's offline copy at most this often. */
const SNAPSHOT_REFRESH_MS = 12 * 60 * 60 * 1000;

interface UseExhibitionDataResult {
  modelsById: Record<string, ViewerModelWithAllTextures>;
  /** True until the first successful fetch for every referenced viewer has completed. */
  isLoading: boolean;
  /** Viewer ids that failed on the initial load (still retried on the poll interval). */
  failedViewerIds: string[];
}

/**
 * Cheap structural equality check for the plain-JSON model+texture rows this
 * endpoint returns. Used to avoid replacing a model's object identity in
 * state when a poll returns byte-for-byte the same data — without this,
 * every 30s poll would create a brand-new `modelsById` object even when
 * nothing changed, cascading into unnecessary re-renders and (previously) a
 * periodic full-screen "flash" back to the preload screen.
 */
function sameModel(a: ViewerModelWithAllTextures | undefined, b: ViewerModelWithAllTextures): boolean {
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fetches (and live-polls) model+texture data for every viewer referenced by
 * an exhibition config, via the same public endpoint the single-model viewer
 * already uses for texture cycling (/api/viewer-models-all-textures/[viewerId]).
 *
 * One request per UNIQUE viewer, not per cell — a 20-cell grid pointing at
 * 3 viewers only makes 3 requests, not 20. Only viewers that actually have a
 * 'user-uploads' cell are polled on a timer; viewers used solely by
 * 'original-locked' cells are fetched once (their texture pool doesn't need
 * to be watched for new uploads).
 *
 * Offline: every successful response is also saved in the browser
 * (lib/exhibition-offline-store.ts). When a viewer can't be fetched — no
 * connection, server down, or a request that times out — and nothing is
 * loaded for it yet, its last saved copy is used instead.
 */
export function useExhibitionData(
  cells: ExhibitionCellConfig[],
  pollIntervalMs: number
): UseExhibitionDataResult {
  const [modelsById, setModelsById] = useState<Record<string, ViewerModelWithAllTextures>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [failedViewerIds, setFailedViewerIds] = useState<string[]>([]);
  const loadedOnceRef = useRef(false);
  // Latest merged data, so concurrent viewer fetches can tell synchronously whether they changed anything.
  const modelsRef = useRef<Record<string, ViewerModelWithAllTextures>>({});
  const loadedViewerIdsRef = useRef(new Set<string>());
  const snapshotSavedAtRef = useRef(new Map<string, number>());

  const viewerIds = Array.from(new Set(cells.map((c) => c.viewerId)));
  const pollableViewerIds = Array.from(
    new Set(cells.filter((c) => c.textureMode === 'user-uploads').map((c) => c.viewerId))
  );

  useEffect(() => {
    if (viewerIds.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    /** Merges models into state; returns whether anything changed. */
    function applyModels(models: ViewerModelWithAllTextures[]): boolean {
      const prev = modelsRef.current;
      const changedModels = models.filter((m) => !sameModel(prev[m.id], m));
      // Keeping the SAME object when nothing changed avoids re-rendering the grid.
      if (changedModels.length === 0) return false;
      const next = { ...prev };
      for (const m of changedModels) next[m.id] = m;
      modelsRef.current = next;
      setModelsById(next);
      return true;
    }

    async function fetchViewer(viewerId: string): Promise<void> {
      const snapshotKey = viewerDataSnapshotKey(viewerId);
      try {
        if (!getIsOnline()) throw new Error('offline');
        const res = await fetchWithTimeout(`/api/viewer-models-all-textures/${viewerId}`, DATA_FETCH_TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const models = (data.models || []) as ViewerModelWithAllTextures[];
        const changed = applyModels(models);
        loadedViewerIdsRef.current.add(viewerId);
        const lastSaved = snapshotSavedAtRef.current.get(viewerId) ?? 0;
        if (changed || Date.now() - lastSaved > SNAPSHOT_REFRESH_MS) {
          snapshotSavedAtRef.current.set(viewerId, Date.now());
          saveSnapshot(snapshotKey, models).catch(() => {});
        }
        setFailedViewerIds((prev) => prev.filter((id) => id !== viewerId));
      } catch (err) {
        if (cancelled) return;
        if (!loadedViewerIdsRef.current.has(viewerId)) {
          const snapshot = await loadSnapshot<ViewerModelWithAllTextures[]>(snapshotKey);
          if (cancelled) return;
          if (snapshot) {
            console.warn('[Exhibition] Using saved offline copy of viewer data:', viewerId, err);
            applyModels(snapshot.data);
            loadedViewerIdsRef.current.add(viewerId);
            return;
          }
        }
        console.error('[Exhibition] Failed to fetch viewer data:', viewerId, err);
        setFailedViewerIds((prev) => (prev.includes(viewerId) ? prev : [...prev, viewerId]));
      }
    }

    async function fetchAll(isBackgroundPoll: boolean) {
      if (isBackgroundPoll && !getIsOnline()) return;
      const targets = isBackgroundPoll ? pollableViewerIds : viewerIds;
      await Promise.all(targets.map(fetchViewer));
      if (!cancelled && !loadedOnceRef.current) {
        loadedOnceRef.current = true;
        setIsLoading(false);
      }
    }

    fetchAll(false);

    const interval = pollableViewerIds.length > 0 ? setInterval(() => fetchAll(true), pollIntervalMs) : null;
    // Back online: refresh every viewer, not just polled ones — the page may
    // have started from offline copies.
    const unsubscribe = subscribeConnectivity((online) => {
      if (online) fetchAll(false);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIds.join(','), pollableViewerIds.join(','), pollIntervalMs]);

  return { modelsById, isLoading, failedViewerIds };
}
