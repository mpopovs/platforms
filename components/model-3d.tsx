'use client';

import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';
import { getModel, storeModel, getTexture, storeTexture } from '@/lib/texture-cache';

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
  onLoadingChange
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
    mixerRef.current = null;
    animationsRef.current = [];

    const loadModelWithCache = async () => {
      try {
        // Check IndexedDB cache first
        const cachedBlob = await getModel(modelUrl);
        
        if (cachedBlob) {
          // Load from cached blob
          const objectURL = URL.createObjectURL(cachedBlob);
          const fileExtension = modelUrl.split('.').pop()?.toLowerCase();
          
          if (fileExtension === 'glb' || fileExtension === 'gltf') {
            const loader = new GLTFLoader();
            loader.load(objectURL, (gltf) => {
              setModel(gltf.scene);
              
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
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          // Store in IndexedDB for next time
          if (modelId) {
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
              URL.revokeObjectURL(objectURL);
            }, undefined, (err) => {
              console.error('[Model3D] Failed to load OBJ from network:', err);
              URL.revokeObjectURL(objectURL);
            });
          }
        }
      } catch (error) {
        console.error('[Model3D] Error loading model from URL:', modelUrl, error);
      }
    };

    loadModelWithCache();
  }, [modelUrl, modelId]);

  // Load texture with IndexedDB caching
  useEffect(() => {
    if (!textureUrl) {
      console.log('[Texture] No texture URL provided, skipping texture load');
      return;
    }

    // Skip invalid URLs (like local://indexeddb placeholder)
    if (textureUrl.startsWith('local://') || textureUrl === 'local://indexeddb') {
      console.log('[Texture] Skipping local placeholder URL:', textureUrl);
      return;
    }

    const loadTextureWithCache = async () => {
      try {
        // Validate URL before attempting to fetch
        if (!textureUrl || textureUrl.trim() === '') {
          console.warn('[Texture] Empty texture URL, skipping');
          return;
        }

        console.log('[Texture] Loading texture:', textureUrl);

        // Check IndexedDB cache first
        const cachedBlob = await getTexture(textureUrl);
        
        if (cachedBlob) {
          console.log('[Texture] Found in cache');
          // Load from cached blob
          const objectURL = URL.createObjectURL(cachedBlob);
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(objectURL, (loadedTexture) => {
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.flipY = false;
            setTexture(loadedTexture);
            URL.revokeObjectURL(objectURL);
            console.log('[Texture] Loaded from cache successfully');
          }, undefined, (err) => {
            console.error('[Texture] Failed to load from cache:', err);
            URL.revokeObjectURL(objectURL);
          });
        } else {
          console.log('[Texture] Not in cache, fetching from network:', textureUrl);
          // Fetch from network and cache
          const response = await fetch(textureUrl);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const blob = await response.blob();
          console.log('[Texture] Fetched successfully, size:', blob.size);
          
          // Store in IndexedDB for next time
          if (modelId && textureId) {
            await storeTexture(textureUrl, blob, modelId, textureId).catch((err: unknown) =>
              console.warn('[Cache] Failed to store texture:', err)
            );
          }
          
          const objectURL = URL.createObjectURL(blob);
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(objectURL, (loadedTexture) => {
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.flipY = false;
            setTexture(loadedTexture);
            URL.revokeObjectURL(objectURL);
            console.log('[Texture] Loaded from network successfully');
          }, undefined, (err) => {
            console.error('[Texture] Failed to load from network:', err);
            URL.revokeObjectURL(objectURL);
          });
        }
      } catch (error) {
        console.error('[Texture] Error loading texture from URL:', textureUrl, error);
      }
    };

    loadTextureWithCache();
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

  // Configure material for proper lighting response
  useEffect(() => {
    if (model) {
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

  // Update loading state when model is loaded
  useEffect(() => {
    setIsLoading(!model);
  }, [model]);

  if (!model) {
    // Return null instead of placeholder - parent will show spinner
    return null;
  }

  return <primitive ref={meshRef} object={model} scale={1} />;
});

// Display name for debugging
Model3D.displayName = 'Model3D';
