'use client';

import { useEffect, useRef } from 'react';
import type { SceneHandle } from '@claypixels/scene-engine';

/** Full-screen scene player (no editor). */
export function ScenePlayer({ base }: { base: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let handle: SceneHandle | null = null;
    let cancelled = false;
    import('@claypixels/scene-engine').then(async ({ mountScene }) => {
      if (cancelled) return;
      handle = await mountScene(host, { base });
      if (cancelled) handle.destroy();
    });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [base]);
  return <div ref={ref} className="fixed inset-0 bg-[#cdd6e0]" />;
}
