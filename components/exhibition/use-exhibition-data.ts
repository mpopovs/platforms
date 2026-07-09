'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExhibitionCellConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { getIsOnline, subscribeConnectivity } from '@/lib/connectivity-monitor';

interface UseExhibitionDataResult {
  modelsById: Record<string, ViewerModelWithAllTextures>;
  /** True until the first successful fetch for every referenced viewer has completed. */
  isLoading: boolean;
  /** Viewer ids that failed on the initial load (still retried on the poll interval). */
  failedViewerIds: string[];
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
 */
export function useExhibitionData(
  cells: ExhibitionCellConfig[],
  pollIntervalMs: number
): UseExhibitionDataResult {
  const [modelsById, setModelsById] = useState<Record<string, ViewerModelWithAllTextures>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [failedViewerIds, setFailedViewerIds] = useState<string[]>([]);
  const loadedOnceRef = useRef(false);

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

    async function fetchViewer(viewerId: string): Promise<void> {
      try {
        const res = await fetch(`/api/viewer-models-all-textures/${viewerId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const models = (data.models || []) as ViewerModelWithAllTextures[];
        setModelsById((prev) => {
          const next = { ...prev };
          for (const m of models) next[m.id] = m;
          return next;
        });
        setFailedViewerIds((prev) => prev.filter((id) => id !== viewerId));
      } catch (err) {
        console.error('[Exhibition] Failed to fetch viewer data:', viewerId, err);
        if (!cancelled) setFailedViewerIds((prev) => (prev.includes(viewerId) ? prev : [...prev, viewerId]));
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
    const unsubscribe = subscribeConnectivity((online) => {
      if (online) fetchAll(true);
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
