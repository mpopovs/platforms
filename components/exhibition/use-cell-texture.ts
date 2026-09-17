'use client';

import { useEffect, useRef, useState } from 'react';
import { cyclingUsesInterval, nextTextureChangeDelayMs, type ExhibitionCellConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures, ModelTextureRow } from '@/lib/types/viewer';
import { getStorageThumbnailUrl } from '@/lib/storage';

export interface CellTextureResult {
  /** Ready-to-render (possibly imgproxy-resized) texture URL, or null while nothing is available. */
  url: string | null;
  /** Stable id for IndexedDB cache bookkeeping in Model3D (not the same as the URL, which changes with the quality ladder). */
  textureId: string;
}

function sortNewestFirst(textures: ModelTextureRow[]): ModelTextureRow[] {
  return [...textures].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
}

/**
 * Pure resolution logic shared by the live hook (below) and the exhibition
 * preload screen, which needs to know — and pre-warm the cache for — exactly
 * the URL a cell will render on first paint (cycleIndex 0).
 *
 * This is the ONLY place allowed to pick a cell's texture — enforced in code,
 * not just the curation UI:
 *  - 'original-locked' cells NEVER read from `model.textures` (the
 *    community/user-uploads pool) — they only ever resolve
 *    `cell.lockedTextureId`, falling back to the model's template texture.
 *  - 'user-uploads' cells pick from `model.textures` at `cycleIndex` and
 *    never consult `lockedTextureId`.
 */
export function resolveCellTexture(
  cell: ExhibitionCellConfig,
  model: ViewerModelWithAllTextures | undefined,
  cycleIndex: number,
  textureMaxDim: number,
  textureQuality: number
): CellTextureResult {
  if (cell.textureMode === 'original-locked') {
    const locked = model?.textures.find((t) => t.id === cell.lockedTextureId);
    const sourceUrl = locked?.corrected_texture_url ?? model?.texture_template_url ?? null;
    return {
      url: sourceUrl ? getStorageThumbnailUrl(sourceUrl, { width: textureMaxDim, quality: textureQuality }) : null,
      textureId: locked?.id ?? 'template',
    };
  }

  // 'user-uploads'
  const textures = model ? sortNewestFirst(model.textures) : [];
  if (textures.length === 0) {
    // No uploads yet — fall back to the template so the cell isn't blank.
    const sourceUrl = model?.texture_template_url ?? null;
    return {
      url: sourceUrl ? getStorageThumbnailUrl(sourceUrl, { width: textureMaxDim, quality: textureQuality }) : null,
      textureId: 'template',
    };
  }

  const idx = Math.min(cycleIndex, textures.length - 1);
  const current = textures[idx];
  return {
    url: getStorageThumbnailUrl(current.corrected_texture_url, { width: textureMaxDim, quality: textureQuality }),
    textureId: current.id,
  };
}

interface UseCellTextureOptions {
  cell: ExhibitionCellConfig;
  model: ViewerModelWithAllTextures | undefined;
  /** Current texture-resolution cap (px), driven by the grid's quality-scaling ladder. */
  textureMaxDim: number;
  textureQuality: number;
  /** Bump this number to force an immediate advance to the next texture ('user-uploads' cells only). */
  forceAdvanceSignal?: number;
  /** Pick each wait randomly around the interval (see nextTextureChangeDelayMs) instead of a fixed period. */
  randomTiming?: boolean;
}

/** Live version of resolveCellTexture(): drives cycle/random/newest-first swaps over time for 'user-uploads' cells. */
export function useCellTexture({
  cell,
  model,
  textureMaxDim,
  textureQuality,
  forceAdvanceSignal = 0,
  randomTiming = false,
}: UseCellTextureOptions): CellTextureResult {
  const [cycleIndex, setCycleIndex] = useState(0);
  const newestId = model ? sortNewestFirst(model.textures)[0]?.id : undefined;

  // Drive cycle/random swaps on a timer for 'user-uploads' cells. Each wait is
  // scheduled separately so random timing can vary it from one change to the next.
  useEffect(() => {
    if (cell.textureMode !== 'user-uploads') return;
    if (!cyclingUsesInterval(cell.cycling.strategy)) return; // 'newest-first' is handled by the effect below instead

    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timer = setTimeout(advance, nextTextureChangeDelayMs(cell.cycling.intervalSec, randomTiming));
    };
    const advance = () => {
      setCycleIndex((prev) => {
        const pool = model ? sortNewestFirst(model.textures) : [];
        if (pool.length === 0) return prev;
        if (cell.cycling.strategy === 'random') {
          if (pool.length === 1) return 0;
          let next = Math.floor(Math.random() * pool.length);
          if (next === prev) next = (next + 1) % pool.length;
          return next;
        }
        // 'cycle': advance sequentially through the newest-first-sorted pool
        return (prev + 1) % pool.length;
      });
      scheduleNext();
    };

    scheduleNext();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.textureMode, cell.cycling.strategy, cell.cycling.intervalSec, randomTiming, model]);

  // 'newest-first': jump to index 0 the moment a new upload arrives for this model.
  useEffect(() => {
    if (cell.textureMode !== 'user-uploads' || cell.cycling.strategy !== 'newest-first') return;
    setCycleIndex(0);
  }, [cell.textureMode, cell.cycling.strategy, newestId]);

  // Curator hotkey: force-advance to the next texture immediately (skip 0 on first mount).
  const isFirstForceSignal = useRef(true);
  useEffect(() => {
    if (isFirstForceSignal.current) { isFirstForceSignal.current = false; return; }
    if (cell.textureMode !== 'user-uploads') return;
    setCycleIndex((prev) => {
      const pool = model ? sortNewestFirst(model.textures) : [];
      if (pool.length === 0) return prev;
      return (prev + 1) % pool.length;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceAdvanceSignal]);

  return resolveCellTexture(cell, model, cycleIndex, textureMaxDim, textureQuality);
}
