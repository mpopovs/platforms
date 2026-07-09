'use client';

import { useEffect, useState } from 'react';
import type { ExhibitionConfig, ExhibitionCellConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { getModel, storeModel, getTexture, storeTexture } from '@/lib/texture-cache';
import { getIsOnline } from '@/lib/connectivity-monitor';
import { resolveCellTexture } from './use-cell-texture';

export interface ExhibitionPreloadProgress {
  loaded: number;
  total: number;
  done: boolean;
}

/**
 * Warms the IndexedDB model/texture cache (the same cache Model3D itself
 * reads from) for every model and every cell's initial texture BEFORE the
 * grid is allowed to mount — this is what satisfies "preload all exhibition
 * assets with a loading progress screen, so nothing pops in during the show".
 *
 * Deliberately bypasses model-3d.tsx's small in-memory preloadTexture()
 * cache (capped at 6 decoded textures — fine for the single-model carousel's
 * "one texture ahead" use case, but far too small for up to 20 simultaneous
 * cells here). Instead this fetches + writes straight into the same
 * IndexedDB store Model3D reads on mount, so every cell hits an instant
 * cache hit regardless of how many cells there are.
 */
export function useExhibitionPreload(
  config: ExhibitionConfig | null,
  modelsById: Record<string, ViewerModelWithAllTextures>,
  dataLoading: boolean
): ExhibitionPreloadProgress {
  const [progress, setProgress] = useState<ExhibitionPreloadProgress>({ loaded: 0, total: 0, done: false });

  useEffect(() => {
    if (!config || dataLoading) return;
    const allResolved = config.cells.every((c) => modelsById[c.modelId]);
    if (!allResolved) return;

    let cancelled = false;

    async function run() {
      const cfg = config!;
      const modelUrlToId = new Map<string, string>();
      const textureJobs: Array<{ cell: ExhibitionCellConfig; model: ViewerModelWithAllTextures }> = [];

      for (const cell of cfg.cells) {
        const model = modelsById[cell.modelId];
        if (!model) continue;
        modelUrlToId.set(model.model_file_url, model.id);
        textureJobs.push({ cell, model });
      }

      let loaded = 0;
      const total = modelUrlToId.size + textureJobs.length;
      setProgress({ loaded, total, done: false });

      const bump = () => {
        loaded += 1;
        if (!cancelled) setProgress({ loaded, total, done: false });
      };

      async function preloadModel(url: string, modelId: string) {
        try {
          const cached = await getModel(url);
          if (!cached && getIsOnline()) {
            const res = await fetch(url);
            if (res.ok) {
              const blob = await res.blob();
              await storeModel(url, blob, modelId).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('[Exhibition] Preload model failed:', url, err);
        } finally {
          bump();
        }
      }

      // Warm the initial (cycleIndex 0) texture for every cell using the
      // grid's starting quality level — the exact same URL ExhibitionGrid
      // will request on first render.
      const startingMaxDim = cfg.tunables.qualityStepDownTextureDims[0] ?? cfg.tunables.defaultTextureMaxDim;

      async function preloadCellTexture(cell: ExhibitionCellConfig, model: ViewerModelWithAllTextures) {
        try {
          const { url, textureId } = resolveCellTexture(cell, model, 0, startingMaxDim, cfg.tunables.textureQuality);
          if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('local://')) return;

          const cached = await getTexture(url);
          if (!cached && getIsOnline()) {
            const res = await fetch(url);
            if (res.ok) {
              const blob = await res.blob();
              await storeTexture(url, blob, model.id, textureId).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('[Exhibition] Preload texture failed:', model.id, err);
        } finally {
          bump();
        }
      }

      const jobs: Array<() => Promise<void>> = [
        ...Array.from(modelUrlToId.entries()).map(([url, modelId]) => () => preloadModel(url, modelId)),
        ...textureJobs.map(({ cell, model }) => () => preloadCellTexture(cell, model)),
      ];

      const concurrency = Math.max(1, cfg.tunables.preloadConcurrency);
      let cursor = 0;
      async function worker() {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          await job();
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker));

      if (!cancelled) setProgress({ loaded: total, total, done: true });
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, dataLoading, modelsById]);

  return progress;
}
