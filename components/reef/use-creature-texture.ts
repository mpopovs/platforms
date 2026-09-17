'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { getTexture, storeTexture } from '@/lib/texture-cache';

/**
 * Load a child's coloring into a THREE.Texture for use on a reef creature.
 *
 * Order of preference, mirroring the rest of the viewer:
 *   1. IndexedDB texture cache (offline-safe, instant on repeat)
 *   2. Network fetch (then cached for next time)
 * `data:`/`blob:` URLs (demo mode) are loaded directly with no caching.
 *
 * Returns null until the texture is ready. The texture is disposed on unmount.
 */
export function useCreatureTexture(
  url: string | null | undefined,
  ids?: { modelId?: string; textureId?: string },
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    let created: THREE.Texture | null = null;

    async function load() {
      try {
        let src = url as string;
        const isInline = url!.startsWith('data:') || url!.startsWith('blob:');

        if (!isInline) {
          let blob = await getTexture(url!);
          if (!blob) {
            const res = await fetch(url!);
            if (!res.ok) throw new Error(`fetch ${res.status}`);
            blob = await res.blob();
            // Best-effort cache for next load; ignore failures (quota etc.)
            storeTexture(
              url!,
              blob,
              ids?.modelId ?? 'reef',
              ids?.textureId ?? url!,
            ).catch(() => {});
          }
          objectUrl = URL.createObjectURL(blob);
          src = objectUrl;
        }

        const loaded = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(src, resolve, undefined, reject);
        });

        if (cancelled) {
          loaded.dispose();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }

        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        created = loaded;
        setTexture(loaded);
      } catch (err) {
        if (!cancelled) console.warn('[reef] creature texture load failed:', url, err);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (created) created.dispose();
    };
  }, [url]);

  return texture;
}
