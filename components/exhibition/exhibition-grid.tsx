'use client';

import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { Group } from 'three';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import type { ExhibitionCellConfig, ExhibitionConfig, GridCellRect, TextureChangeBlinkConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { ExhibitionCellScene } from './exhibition-cell';
import { FpsMonitor } from './fps-monitor';
import { ExhibitionCellRenderer, WaterfallDriver, type WaterfallFrame } from './cell-renderer';
import { useIsOnline } from './use-is-online';

const CELL_GAP_PX = 2;

interface ExhibitionGridProps {
  config: ExhibitionConfig;
  modelsById: Record<string, ViewerModelWithAllTextures>;
  /** Curator hotkey: freezes rotation on every cell and the waterfall scroll. Default false. */
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
 * While offline every cell stays at the starting level: that is the only
 * resolution saved for offline use, and any other size can't be downloaded.
 *
 * Cells are drawn by ExhibitionCellRenderer rather than by <View> itself —
 * see ./cell-renderer.tsx for why, and for how waterfall mode
 * (config.waterfall) draws cells at their scrolled positions without moving
 * the tracked DOM elements.
 */
export function ExhibitionGrid({
  config,
  modelsById,
  paused = false,
  forceAdvanceSignal = 0,
  fullscreen = true,
}: ExhibitionGridProps) {
  const { layout, cells, tunables, modelScale, waterfall, backgroundColor, textureChangeBlink, randomTextureTiming } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const waterfallFrameRef = useRef<WaterfallFrame>({ offset: 0, period: 1 });
  const [qualityByCell, setQualityByCell] = useState<Record<string, number>>({});
  const online = useIsOnline();

  const cellConfigById = useMemo(() => {
    const map = new Map(cells.map((c) => [c.cellId, c]));
    return map;
  }, [cells]);

  const handleFpsSample = useCallback(
    (fps: number) => {
      if (!online) return;
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
    [online, cells, tunables.minFps, tunables.targetFps, tunables.qualityStepDownTextureDims.length]
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
        gap: `${CELL_GAP_PX}px`,
        // The loop seam (bottom row → top row of the next pass) needs the same gap as between rows.
        paddingBottom: waterfall.enabled ? `${CELL_GAP_PX}px` : undefined,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {layout.cells.map((rect) => {
        const cellConfig = cellConfigById.get(rect.id);
        if (!cellConfig) return <div key={rect.id} />; // empty grid slot, no model assigned yet

        const model = modelsById[cellConfig.modelId];
        const qualityIdx = online ? qualityByCell[cellConfig.cellId] ?? 0 : 0;
        const textureMaxDim = tunables.qualityStepDownTextureDims[qualityIdx] ?? tunables.defaultTextureMaxDim;

        return (
          <ExhibitionGridCell
            key={rect.id}
            rect={rect}
            cell={cellConfig}
            model={model}
            textureMaxDim={textureMaxDim}
            textureQuality={tunables.textureQuality}
            modelScale={modelScale}
            textureChangeBlink={textureChangeBlink}
            randomTextureTiming={randomTextureTiming}
            paused={paused}
            forceAdvanceSignal={forceAdvanceSignal}
            waterfallFrameRef={waterfall.enabled ? waterfallFrameRef : null}
          />
        );
      })}

      <Canvas
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <View.Port />
        <FpsMonitor sampleWindowMs={tunables.fpsSampleWindowMs} onSample={handleFpsSample} />
        {waterfall.enabled && (
          <WaterfallDriver
            frameRef={waterfallFrameRef}
            speed={waterfall.speed}
            loopGap={waterfall.loopGap}
            paused={paused}
          />
        )}
      </Canvas>
    </div>
  );
}

function ExhibitionGridCell({
  rect,
  cell,
  model,
  textureMaxDim,
  textureQuality,
  modelScale,
  textureChangeBlink,
  randomTextureTiming,
  paused,
  forceAdvanceSignal,
  waterfallFrameRef,
}: {
  rect: GridCellRect;
  cell: ExhibitionCellConfig;
  model: ViewerModelWithAllTextures | undefined;
  textureMaxDim: number;
  textureQuality: number;
  modelScale: number;
  textureChangeBlink: TextureChangeBlinkConfig;
  randomTextureTiming: boolean;
  paused: boolean;
  forceAdvanceSignal: number;
  /** Set only while the waterfall is on. */
  waterfallFrameRef: RefObject<WaterfallFrame> | null;
}) {
  const viewRef = useRef<HTMLElement | Group>(null);
  const blinkFramesRef = useRef(0);

  return (
    <View
      ref={viewRef}
      // ExhibitionCellRenderer draws this cell instead of the View itself.
      visible={false}
      style={{
        gridColumn: `${rect.col + 1} / span ${rect.colSpan ?? 1}`,
        gridRow: `${rect.row + 1} / span ${rect.rowSpan ?? 1}`,
        position: 'relative',
      }}
    >
      <ExhibitionCellScene
        cell={cell}
        model={model}
        textureMaxDim={textureMaxDim}
        textureQuality={textureQuality}
        modelScale={modelScale}
        textureChangeBlink={textureChangeBlink}
        randomTextureTiming={randomTextureTiming}
        blinkFramesRef={blinkFramesRef}
        paused={paused}
        forceAdvanceSignal={forceAdvanceSignal}
      />
      <ExhibitionCellRenderer cellRef={viewRef} frameRef={waterfallFrameRef} blinkFramesRef={blinkFramesRef} />
    </View>
  );
}
