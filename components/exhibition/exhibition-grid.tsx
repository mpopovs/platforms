'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import type { ExhibitionConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { ExhibitionCellScene } from './exhibition-cell';
import { FpsMonitor } from './fps-monitor';

interface ExhibitionGridProps {
  config: ExhibitionConfig;
  modelsById: Record<string, ViewerModelWithAllTextures>;
  backgroundColor?: string;
  /** Curator hotkey: freezes rotation on every cell. Default false. */
  paused?: boolean;
  /** Curator hotkey: bump to force every 'user-uploads' cell to its next texture. Default 0. */
  forceAdvanceSignal?: number;
  /** Fullscreen (fixed, covers the viewport — the /exhibition show route) vs. embedded (fills its parent container — the curation page's live preview). Default true. */
  fullscreen?: boolean;
}

/**
 * Renders up to MAX_EXHIBITION_CELLS models simultaneously using ONE shared
 * WebGL context: each grid cell is a plain DOM <div> tracked by drei's
 * <View>, which portals its own THREE.Scene + camera into that div's screen
 * rectangle via gl.scissor on a single <Canvas> — this is what avoids the
 * "20 separate WebGL contexts" problem (browsers cap contexts around 8-16).
 *
 * Per-cell quality scaling: a single FpsMonitor rendered as a direct child of
 * the shared canvas reports a rolling-average fps. When it drops below
 * tunables.minFps we step DOWN one cell's texture-resolution cap at a time
 * (round-robin), instead of degrading everything at once. When fps recovers
 * above tunables.targetFps we step the most-degraded cell back up. This
 * keeps quality loss minimal and reversible rather than a global cliff.
 */
export function ExhibitionGrid({
  config,
  modelsById,
  backgroundColor = '#000000',
  paused = false,
  forceAdvanceSignal = 0,
  fullscreen = true,
}: ExhibitionGridProps) {
  const { layout, cells, tunables } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const [qualityByCell, setQualityByCell] = useState<Record<string, number>>({});

  const cellConfigById = useMemo(() => {
    const map = new Map(cells.map((c) => [c.cellId, c]));
    return map;
  }, [cells]);

  const handleFpsSample = useCallback(
    (fps: number) => {
      setQualityByCell((prev) => {
        const maxIdx = tunables.qualityStepDownTextureDims.length - 1;

        if (fps < tunables.minFps) {
          // Degrade exactly one cell (round-robin: whichever isn't already maxed out).
          const candidate = cells.find((c) => (prev[c.cellId] ?? 0) < maxIdx);
          if (!candidate) return prev;
          return { ...prev, [candidate.cellId]: (prev[candidate.cellId] ?? 0) + 1 };
        }

        if (fps > tunables.targetFps) {
          // Recover: step the currently most-degraded cell back up by one level.
          const degraded = Object.entries(prev).filter(([, level]) => level > 0);
          if (degraded.length === 0) return prev;
          degraded.sort((a, b) => b[1] - a[1]);
          const [cellId, level] = degraded[0];
          return { ...prev, [cellId]: level - 1 };
        }

        return prev;
      });
    },
    [cells, tunables.minFps, tunables.targetFps, tunables.qualityStepDownTextureDims.length]
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : undefined,
        width: fullscreen ? '100vw' : '100%',
        height: fullscreen ? '100vh' : '100%',
        backgroundColor,
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: '2px',
        overflow: 'hidden',
      }}
    >
      {layout.cells.map((rect) => {
        const cellConfig = cellConfigById.get(rect.id);
        if (!cellConfig) return <div key={rect.id} />; // empty grid slot, no model assigned yet

        const model = modelsById[cellConfig.modelId];
        const qualityIdx = qualityByCell[cellConfig.cellId] ?? 0;
        const textureMaxDim = tunables.qualityStepDownTextureDims[qualityIdx] ?? tunables.defaultTextureMaxDim;

        return (
          <View
            key={rect.id}
            style={{
              gridColumn: `${rect.col + 1} / span ${rect.colSpan ?? 1}`,
              gridRow: `${rect.row + 1} / span ${rect.rowSpan ?? 1}`,
              position: 'relative',
            }}
          >
            <ExhibitionCellScene
              cell={cellConfig}
              model={model}
              textureMaxDim={textureMaxDim}
              textureQuality={tunables.textureQuality}
              paused={paused}
              forceAdvanceSignal={forceAdvanceSignal}
            />
          </View>
        );
      })}

      <Canvas
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <View.Port />
        <FpsMonitor sampleWindowMs={tunables.fpsSampleWindowMs} onSample={handleFpsSample} />
      </Canvas>
    </div>
  );
}
