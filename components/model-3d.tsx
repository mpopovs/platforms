'use client';

import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';
import { getModel, storeModel, getTexture, storeTexture } from '@/lib/texture-cache';

// ─── Module-level decoded-texture preload cache ───────────────────────────────
// The carousel pre-decodes the next texture into a THREE.Texture while the
// current one is on screen. Model3D consumes it instantly (no decode delay).
const preloadCache = new Map<string, THREE.Texture>();
const MAX_PRELOAD_CACHE = 6;

/**
 * Pre-decode a texture from IndexedDB / network into a THREE.Texture.
 * Safe to call speculatively — already-cached URLs are skipped.
 */
export async function preloadTexture(url: string, signal?: AbortSignal): Promise<void> {
  if (!url || url.startsWith('local://') || preloadCache.has(url)) return;
  try {
    let blob: Blob | null = await getTexture(url);
    if (signal?.aborted) return;
    if (!blob) {
      const res = await fetch(url, { signal });
      if (!res.ok || signal?.aborted) return;
      blob = await res.blob();
    }
    if (signal?.aborted) return;
    const objectURL = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      new THREE.TextureLoader().load(
        objectURL,
        (t) => {
          URL.revokeObjectURL(objectURL);
          if (signal?.aborted) { t.dispose(); resolve(); return; }
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = false;
          // Evict LRU entry if over limit
          if (preloadCache.size >= MAX_PRELOAD_CACHE) {
            const oldest = preloadCache.keys().next().value;
            if (oldest) { preloadCache.get(oldest)?.dispose(); preloadCache.delete(oldest); }
          }
          preloadCache.set(url, t);
          console.log('[Preload] Texture ready:', url.split('/').pop());
          resolve();
        },
        undefined,
        (err) => { URL.revokeObjectURL(objectURL); console.warn('[Preload] Decode error:', err); resolve(); }
      );
    });
  } catch (err: unknown) {
    if ((err as Error)?.name !== 'AbortError') console.warn('[Preload] Failed:', url, err);
  }
}

/**
 * Consume a preloaded texture — removes it from cache and transfers ownership
 * to the caller (Model3D), which disposes it when done.
 */
export function consumePreloadedTexture(url: string): THREE.Texture | null {
  const t = preloadCache.get(url) ?? null;
  if (t) preloadCache.delete(url);
  return t;
}
// ─────────────────────────────────────────────────────────────────────────────

// Export interface for animation control
export interface Model3DHandle {
  playAnimation: () => void;
  hasAnimations: boolean;
  isPlaying: boolean;
  isLoading: boolean;
}

interface Model3DProps {
  modelUrl: string;
  textureUrl: string | null;
  rotationSpeed?: number;
  modelId?: string;
  textureId?: string;
  onAnimationStateChange?: (hasAnimations: boolean, isPlaying: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  disableCache?: boolean; // Skip IndexedDB caching (e.g., for upload previews)
}

/**
 * Individual 3D Model Component
 * Loads and displays a single 3D model with texture and animation support
 * Uses IndexedDB for persistent caching
 */
export const Model3D = forwardRef<Model3DHandle, Model3DProps>(({ 
  modelUrl, 
  textureUrl, 
  rotationSpeed = 0.5,
  modelId = '',
  textureId = '',
  onAnimationStateChange,
  onLoadingChange,
  disableCache = false
}, ref) => {
  const meshRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationsRef = useRef<THREE.AnimationClip[]>([]);
  const hasPlayedOnceRef = useRef(false);
  
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hasAnimations, setHasAnimations] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // isModelReady: the model for the CURRENT modelUrl has finished loading.
  // isTextureReady: the texture for the CURRENT textureUrl has finished loading.
  // Both must be true before we make the primitive visible — prevents the
  // "new texture on old model" flash when the carousel advances.
  const [isModelReady, setIsModelReady] = useState(false);
  const [isTextureReady, setIsTextureReady] = useState<boolean>(!textureUrl);

  // Play animation function
  const playAnimation = useCallback(() => {
    if (mixerRef.current && animationsRef.current.length > 0) {
      // Stop any current animations
      mixerRef.current.stopAllAction();
      
      // Play all animations once
      animationsRef.current.forEach(clip => {
        const action = mixerRef.current!.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.reset();
        action.play();
      });
      
      setIsPlaying(true);
      console.log('[Model3D] Playing animations');
    }
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    playAnimation,
    hasAnimations,
    isPlaying,
    isLoading
  }), [playAnimation, hasAnimations, isPlaying, isLoading]);

  // Notify parent of loading state changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);

  // Notify parent of animation state changes
  useEffect(() => {
    if (onAnimationStateChange) {
      onAnimationStateChange(hasAnimations, isPlaying);
    }
  }, [hasAnimations, isPlaying, onAnimationStateChange]);

  // Load 3D model with IndexedDB caching
  useEffect(() => {
    if (!modelUrl || modelUrl.trim() === '') {
      console.warn('[Model3D] Empty model URL, skipping');
      return;
    }

    // Reset animation state when model changes
    hasPlayedOnceRef.current = false;
    setHasAnimations(false);
    setIsPlaying(false);
    // Mark model as NOT ready for the new URL — prevents the old model
    // from showing with the new texture during the async load.
    setIsModelReady(false);
    
    // Cleanup previous mixer
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
      mixerRef.current = null;
    }
    animationsRef.current = [];

    const loadModelWithCache = async () => {
      try {
        // Skip cache if disabled or using blob URLs (temporary)
        const shouldUseCache = !disableCache && !modelUrl.startsWith('blob:');
        
        // Check IndexedDB cache first
        const cachedBlob = shouldUseCache ? await getModel(modelUrl) : null;
        
        if (cachedBlob) {
          // Load from cached blob
          const objectURL = URL.createObjectURL(cachedBlob);
          const fileExtension = modelUrl.split('.').pop()?.toLowerCase();
          
          if (fileExtension === 'glb' || fileExtension === 'gltf') {
            const loader = new GLTFLoader();
            loader.load(objectURL, (gltf) => {
              setModel(gltf.scene);
              setIsModelReady(true);
              
              // Setup animations if present
              if (gltf.animations && gltf.animations.length > 0) {
                console.log('[Model3D] Found animations:', gltf.animations.length);
                animationsRef.current = gltf.animations;
                setHasAnimations(true);
                
                // Create mixer
                mixerRef.current = new THREE.AnimationMixer(gltf.scene);
                
                // Listen for animation finished
                mixerRef.current.addEventListener('finished', () => {
                  setIsPlaying(false);
                  console.log('[Model3D] Animation finished');
                });
              }
              
              URL.revokeObjectURL(objectURL);
            }, undefined, (err) => {
              console.error('[Model3D] Failed to load GLB from cache:', err);
              URL.revokeObjectURL(objectURL);
            });
          } else if (fileExtension === 'obj') {
            const loader = new OBJLoader();
            loader.load(objectURL, (obj) => {
              setModel(obj);
              setIsModelReady(true);
              URL.revokeObjectURL(objectURL);
            }, undefined, (err) => {
              console.error('[Model3D] Failed to load OBJ from cache:', err);
              URL.revokeObjectURL(objectURL);
            });
          }
        } else {
          // Fetch from network and cache
          const response = await fetch(modelUrl);
          
          if (!response.ok) {
            console.error(`[Model3D] Failed to fetch model: HTTP ${response.status}`);
            setIsLoading(false);
            return;
          }
          
          const blob = await response.blob();
          
          // Store in IndexedDB for next time (skip if caching disabled)
          if (shouldUseCache && modelId) {
            await storeModel(modelUrl, blob, modelId).catch((err: unknown) => 
              console.warn('[Cache] Failed to store model:', err)
            );
          }
          
          const objectURL = URL.createObjectURL(blob);
          const fileExtension = modelUrl.split('.').pop()?.toLowerCase();
          
          if (fileExtension === 'glb' || fileExtension === 'gltf') {
            const loader = new GLTFLoader();
            loader.load(objectURL, (gltf) => {
              setModel(gltf.scene);
              setIsModelReady(true);
              
              // Setup animations if present
              if (gltf.animations && gltf.animations.length > 0) {
                console.log('[Model3D] Found animations:', gltf.animations.length);
                animationsRef.current = gltf.animations;
                setHasAnimations(true);
                
                // Create mixer
                mixerRef.current = new THREE.AnimationMixer(gltf.scene);
                
                // Listen for animation finished
                mixerRef.current.addEventListener('finished', () => {
                  setIsPlaying(false);
                  console.log('[Model3D] Animation finished');
                });
              }
              
              URL.revokeObjectURL(objectURL);
            }, undefined, (err) => {
              console.error('[Model3D] Failed to load GLB from network:', err);
              URL.revokeObjectURL(objectURL);
            });
          } else if (fileExtension === 'obj') {
            const loader = new OBJLoader();
            loader.load(objectURL, (obj) => {
              setModel(obj);
              setIsModelReady(true);
              URL.revokeObjectURL(objectURL);
            }, undefined, (err) => {
              console.error('[Model3D] Failed to load OBJ from network:', err);
              URL.revokeObjectURL(objectURL);
            });
          }
        }
      } catch (error) {
        console.error('[Model3D] Error loading model from URL:', modelUrl, error);
        setIsLoading(false);
      }
    };

    loadModelWithCache();

    // Cleanup function to dispose of previous model
    return () => {
      if (model) {
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) {
              child.geometry.dispose();
            }
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  if (mat.map) mat.map.dispose();
                  mat.dispose();
                });
              } else {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
              }
            }
          }
        });
      }
      
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
      }
    };
  }, [modelUrl, modelId]);

  // Load texture with IndexedDB caching
  useEffect(() => {
    // Always clear the previous texture when the URL changes (including when null).
    // Without this, the old texture stays in state and gets applied to the next model
    // while the new texture loads asynchronously — causing one texture to appear on all models.
    setTexture(null);

    if (!textureUrl) {
      // No texture needed — mark as ready immediately so model renders without delay
      setIsTextureReady(true);
      console.log('[Texture] No texture URL provided, skipping texture load');
      return;
    }

    // New URL coming in — hide the model until this texture finishes loading
    setIsTextureReady(false);

    // Skip invalid URLs (like local://indexeddb placeholder)
    if (textureUrl.startsWith('local://') || textureUrl === 'local://indexeddb') {
      console.log('[Texture] Skipping local placeholder URL:', textureUrl);
      setIsTextureReady(true); // Don't block on placeholder URLs
      return;
    }

    // cancelled flag: if the effect is cleaned up before the async load finishes,
    // we discard the result so a stale texture can't overwrite the correct one.
    let cancelled = false;
    let loadedTexture: THREE.Texture | null = null;

    const loadTextureWithCache = async () => {
      try {
        // Validate URL before attempting to fetch
        if (!textureUrl || textureUrl.trim() === '') {
          console.warn('[Texture] Empty texture URL, skipping');
          return;
        }

        // Skip cache if disabled or using blob/data URLs (temporary)
        const shouldUseCache = !disableCache && !textureUrl.startsWith('blob:') && !textureUrl.startsWith('data:');

        // If it's a data URL or blob URL, load directly without caching
        if (textureUrl.startsWith('data:') || textureUrl.startsWith('blob:')) {
            console.log('[Texture] Data/Blob URL detected, skipping cache');
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(textureUrl, (t) => {
              if (cancelled) { t.dispose(); return; }
              t.colorSpace = THREE.SRGBColorSpace;
              t.flipY = false;
              loadedTexture = t;
              setTexture(t);
              setIsTextureReady(true);
              console.log('[Texture] Loaded from temporary URL successfully');
            }, undefined, (err) => {
              console.error('[Texture] Failed to load from temporary URL:', err);
              if (!cancelled) setIsTextureReady(true);
            });
            return;
        }

        // Check IndexedDB cache first (skip if caching disabled)
        const cachedBlob = shouldUseCache ? await getTexture(textureUrl) : null;
        if (cancelled) return;
        
        if (cachedBlob) {
          console.log('[Texture] Found in cache');
          const objectURL = URL.createObjectURL(cachedBlob);
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(objectURL, (t) => {
            URL.revokeObjectURL(objectURL);
            if (cancelled) { t.dispose(); return; }
            t.colorSpace = THREE.SRGBColorSpace;
            t.flipY = false;
            loadedTexture = t;
            setTexture(t);
            setIsTextureReady(true);
            console.log('[Texture] Loaded from cache successfully');
          }, undefined, (err) => {
            console.error('[Texture] Failed to load from cache:', err);
            URL.revokeObjectURL(objectURL);
            // Allow model to show even without texture rather than blocking forever
            if (!cancelled) setIsTextureReady(true);
          });
        } else {
          console.log('[Texture] Not in cache, fetching from network:', textureUrl);
          const response = await fetch(textureUrl);
          if (cancelled) return;
          
          if (!response.ok) {
            console.error(`[Texture] Failed to fetch: HTTP ${response.status}`);
            // Unblock rendering on fetch failure
            if (!cancelled) setIsTextureReady(true);
            return;
          }
          
          const blob = await response.blob();
          if (cancelled) return;
          console.log('[Texture] Fetched successfully, size:', blob.size);
          
          // Store in IndexedDB for next time (skip if caching disabled)
          if (shouldUseCache && modelId && textureId) {
            await storeTexture(textureUrl, blob, modelId, textureId).catch((err: unknown) =>
              console.warn('[Cache] Failed to store texture:', err)
            );
          }
          if (cancelled) return;
          
          const objectURL = URL.createObjectURL(blob);
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(objectURL, (t) => {
            URL.revokeObjectURL(objectURL);
            if (cancelled) { t.dispose(); return; }
            t.colorSpace = THREE.SRGBColorSpace;
            t.flipY = false;
            loadedTexture = t;
            setTexture(t);
            setIsTextureReady(true);
            console.log('[Texture] Loaded from network successfully');
          }, undefined, (err) => {
            console.error('[Texture] Failed to load from network:', err);
            URL.revokeObjectURL(objectURL);
            // Unblock rendering so a fetch error doesn't freeze the display
            if (!cancelled) setIsTextureReady(true);
          });
        }
      } catch (error) {
        console.error('[Texture] Error loading texture from URL:', textureUrl, error);
        // Unblock rendering on unexpected errors
        if (!cancelled) setIsTextureReady(true);
      }
    };

    // Fast path: carousel already pre-decoded this texture — use it instantly.
    const preloaded = consumePreloadedTexture(textureUrl);
    if (preloaded) {
      loadedTexture = preloaded; // track for cleanup
      setTexture(preloaded);
      setIsTextureReady(true);
      console.log('[Texture] Instant from preload cache:', textureUrl.split('/').pop());
    } else {
      loadTextureWithCache();
    }

    return () => {
      cancelled = true;
      // Dispose the texture loaded by this specific effect run (not stale closure state).
      if (loadedTexture) {
        loadedTexture.dispose();
        loadedTexture = null;
      }
    };
  }, [textureUrl, modelId, textureId]);

  // Apply texture to model
  useEffect(() => {
    if (model && texture) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material) {
            const material = child.material as THREE.MeshStandardMaterial;
            material.map = texture;
            material.needsUpdate = true;
          }
        }
      });
    }
  }, [model, texture]);

  // Configure material for proper lighting response and normalize model size
  useEffect(() => {
    if (model) {
      // Normalize model size to fit camera view consistently
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 4 / maxDim; // Scale to fit within 4 units (camera is at z=8)
      model.scale.setScalar(scale);
      
      // Center the model
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x * scale;
      model.position.y = -center.y * scale;
      model.position.z = -center.z * scale;
      
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.material) {
            const material = child.material as THREE.MeshStandardMaterial;
            // Ensure material responds to all light types
            material.metalness = 0;
            material.roughness = 0.8;
            material.needsUpdate = true;
          }
        }
      });
    }
  }, [model]);

  // Animation and rotation update in render loop
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * rotationSpeed;
    }
    
    // Update animation mixer
    if (mixerRef.current && isPlaying) {
      mixerRef.current.update(delta);
    }
  });

  // Auto-play animation once when loaded
  useEffect(() => {
    if (hasAnimations && !hasPlayedOnceRef.current && model) {
      hasPlayedOnceRef.current = true;
      // Small delay to ensure everything is ready
      setTimeout(() => {
        playAnimation();
      }, 100);
    }
  }, [hasAnimations, model, playAnimation]);

  // Keep the spinner up until BOTH the model and its texture are ready.
  // This prevents the brief flash of an untextured (white) model on Samsung Frame TV.
  useEffect(() => {
    setIsLoading(!isModelReady || !isTextureReady);
  }, [isModelReady, isTextureReady]);

  // Always render the group so the rotation ref is stable.
  // The primitive is hidden (visible=false) until BOTH model and texture are ready —
  // this prevents the new texture from briefly appearing on the old model during transitions.
  return (
    <group ref={meshRef}>
      {model && <primitive object={model} visible={isModelReady && isTextureReady} />}
    </group>
  );
});

// Display name for debugging
Model3D.displayName = 'Model3D';
