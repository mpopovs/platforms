'use client';

import type { RefObject } from 'react';
import type { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { advanceWaterfallProgress, waterfallLoopPeriod } from '@/lib/types/exhibition';

/** Longest frame step applied to the scroll, so a hitch (tab hidden, GC pause) doesn't make the content jump. */
const MAX_FRAME_DELTA_SEC = 0.1;

/** Scroll state shared by the driver and every cell renderer, in grid heights. */
export interface WaterfallFrame {
  /** How far the grid has moved down, in [0, period). */
  offset: number;
  /** One loop: the grid plus the empty gap before it repeats. */
  period: number;
}

interface WaterfallDriverProps {
  frameRef: RefObject<WaterfallFrame>;
  speed: number;
  loopGap: number;
  paused: boolean;
}

/**
 * Advances the shared waterfall position once per frame. Rendered as a direct
 * child of the shared <Canvas> with the default priority (0), so it always
 * runs before the priority-1 cell renderers draw that frame.
 */
export function WaterfallDriver({ frameRef, speed, loopGap, paused }: WaterfallDriverProps) {
  useFrame((_, delta) => {
    const frame = frameRef.current;
    frame.period = waterfallLoopPeriod(loopGap);
    const step = paused ? 0 : Math.min(delta, MAX_FRAME_DELTA_SEC);
    // Also re-wraps the offset when the loop gap is shrunk live in the curation preview.
    frame.offset = advanceWaterfallProgress(frame.offset, speed, step, loopGap);
  });
  return null;
}

interface ExhibitionCellRendererProps {
  /** The cell's <View> element — it stays at its static grid position; only the drawn image moves. */
  cellRef: RefObject<HTMLElement | Group | null>;
  /** Waterfall scroll state, or null to draw the cell in place. */
  frameRef: RefObject<WaterfallFrame> | null;
  /** While above 0, the cell isn't drawn (showing the background) and this counts down once per frame. */
  blinkFramesRef: RefObject<number>;
}

/**
 * Draws one grid cell, replacing drei <View>'s own drawing (the View is
 * mounted with visible={false} but still owns the cell's scene and camera).
 *
 * drei decides a View is offscreen by comparing the cell's position in the
 * browser window with the canvas's height, which is only right when the
 * canvas starts at the top of the window. In the curation page's preview
 * that made rows vanish and reappear as the page scrolled, so visibility is
 * checked here against the canvas's actual rectangle instead.
 *
 * With the waterfall on, each frame draws the cell's scene shifted down by
 * the current scroll offset, plus a second time one loop period higher for
 * the part that has wrapped around to the top. Drawing the SAME scene twice —
 * rather than mounting a second copy of the grid — keeps rotation and texture
 * cycling identical on both sides of the loop seam, and costs no extra
 * model/texture memory. The View's DOM element is deliberately never moved:
 * drei flips an internal React "offscreen" state when a tracked element
 * leaves the canvas, and that state lags one frame behind, which would blank
 * a whole row for a frame every time the loop wraps.
 */
export function ExhibitionCellRenderer({ cellRef, frameRef, blinkFramesRef }: ExhibitionCellRendererProps) {
  useFrame((state) => {
    if (blinkFramesRef.current > 0) {
      blinkFramesRef.current -= 1;
      return;
    }

    const el = cellRef.current;
    if (!(el instanceof HTMLElement)) return;

    const cell = el.getBoundingClientRect();
    const canvas = state.gl.domElement.getBoundingClientRect();
    if (cell.width === 0 || cell.height === 0 || canvas.height === 0) return;

    const left = cell.left - canvas.left;
    if (left + cell.width <= 0 || left >= canvas.width) return;

    const { camera, gl, scene } = state;
    const aspect = cell.width / cell.height;
    if ('isPerspectiveCamera' in camera && camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    // The canvas covers the grid exactly, so its height is one grid height.
    const period = frameRef ? frameRef.current.period * canvas.height : 0;
    const shift = frameRef ? frameRef.current.offset * canvas.height : 0;
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setScissorTest(true);

    for (const offset of frameRef ? [shift, shift - period] : [0]) {
      const top = cell.top - canvas.top + offset;
      if (top + cell.height <= 0 || top >= canvas.height) continue;
      // WebGL's viewport origin is the canvas's bottom-left corner.
      const bottom = canvas.height - (top + cell.height);
      gl.setViewport(left, bottom, cell.width, cell.height);
      gl.setScissor(left, bottom, cell.width, cell.height);
      gl.render(scene, camera);
    }

    gl.setScissorTest(false);
    gl.autoClear = autoClear;
  }, 1);

  return null;
}
