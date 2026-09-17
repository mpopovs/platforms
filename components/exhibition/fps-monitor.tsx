'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * A gap between two frames longer than this means rendering was paused or
 * blocked (hidden tab, minimized window, dev-server recompile, sleep) rather
 * than the grid itself being slow.
 */
const STALL_GAP_MS = 1000;
/** After this many stalls in a row, treat the gaps as real (very) slow rendering again. */
const MAX_CONSECUTIVE_STALLS_IGNORED = 3;

interface FpsMonitorProps {
  sampleWindowMs: number;
  onSample: (fps: number) => void;
}

/**
 * Rendered once as a direct child of the shared exhibition <Canvas> (not
 * inside any per-cell <View>) so it measures the real overall page
 * framerate — the combined cost of rendering every cell each frame — and
 * reports a rolling-window average back to the grid for quality scaling.
 *
 * A window containing a stall is discarded instead of reported: it would
 * read as a near-zero fps and drop a cell's texture quality for no reason
 * (then restore it a few seconds later — two needless texture reloads).
 */
export function FpsMonitor({ sampleWindowMs, onSample }: FpsMonitorProps) {
  const frameCountRef = useRef(0);
  const windowStartRef = useRef<number>(performance.now());
  const lastFrameRef = useRef<number>(performance.now());
  const consecutiveStallsRef = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const gap = now - lastFrameRef.current;
    lastFrameRef.current = now;

    if (gap > STALL_GAP_MS) {
      consecutiveStallsRef.current += 1;
      if (consecutiveStallsRef.current <= MAX_CONSECUTIVE_STALLS_IGNORED) {
        frameCountRef.current = 0;
        windowStartRef.current = now;
        return;
      }
    } else {
      consecutiveStallsRef.current = 0;
    }

    frameCountRef.current += 1;
    const elapsed = now - windowStartRef.current;
    if (elapsed >= sampleWindowMs) {
      onSample((frameCountRef.current / elapsed) * 1000);
      frameCountRef.current = 0;
      windowStartRef.current = now;
    }
  });

  return null;
}
