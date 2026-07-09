'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

interface FpsMonitorProps {
  sampleWindowMs: number;
  onSample: (fps: number) => void;
}

/**
 * Rendered once as a direct child of the shared exhibition <Canvas> (not
 * inside any per-cell <View>) so it measures the real overall page
 * framerate — the combined cost of rendering every cell each frame — and
 * reports a rolling-window average back to the grid for quality scaling.
 */
export function FpsMonitor({ sampleWindowMs, onSample }: FpsMonitorProps) {
  const frameCountRef = useRef(0);
  const windowStartRef = useRef<number>(performance.now());

  useFrame(() => {
    frameCountRef.current += 1;
    const now = performance.now();
    const elapsed = now - windowStartRef.current;
    if (elapsed >= sampleWindowMs) {
      onSample((frameCountRef.current / elapsed) * 1000);
      frameCountRef.current = 0;
      windowStartRef.current = now;
    }
  });

  return null;
}
