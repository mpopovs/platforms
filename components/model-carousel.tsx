'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { ViewerModelWithTexture, DisplayModeSettings, TextureCyclingSettings, ViewerModelWithAllTextures, ModelTexturePair } from '@/lib/types/viewer';
import { Maximize, Play } from 'lucide-react';
import { Model3D, Model3DHandle } from './model-3d';
import { preloadTexture } from './model-3d';
import { prefetchTextures } from '@/lib/texture-cache';
import { getIsOnline, subscribeConnectivity } from '@/lib/connectivity-monitor';
import { TEXTURE_POLL_INTERVAL_MS } from '@/lib/viewer-runtime-config';

interface ModelCarouselProps {
  models: ViewerModelWithTexture[];
  rotationSpeed?: number;
  displayDuration?: number; // seconds (deprecated - use displayModes)
  backgroundColor?: string;
  displayModes?: DisplayModeSettings;
  textureCycling?: TextureCyclingSettings;
  viewerId?: string; // Required for fetching all textures
  logoUrl?: string | null; // Logo to display in bottom-right corner
  ambientLightIntensity?: number; // Ambient light intensity (default: 0.6)
  directionalLightIntensity?: number; // Directional light intensity (default: 0.8)
}

type DisplayMode = 'standard' | 'new-upload' | 'showcase' | 'detailed';

/**
 * Model Carousel Component with Museum Display Algorithm
 * Implements smart timing based on UX research
 * NOW SUPPORTS TEXTURE CYCLING: cycles through model-texture pairs instead of just models
 */
export function ModelCarousel({ 
  models, 
  rotationSpeed: defaultRotationSpeed = 0.5, 
  displayDuration: legacyDisplayDuration = 20,
  backgroundColor = '#000000',
  displayModes,
  textureCycling,
  viewerId,
  logoUrl,
  ambientLightIntensity = 0.6,
  directionalLightIntensity = 0.8
}: ModelCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sortedModels, setSortedModels] = useState<ViewerModelWithTexture[]>([]);
  const [allModelsWithTextures, setAllModelsWithTextures] = useState<ViewerModelWithAllTextures[]>([]);
  const [displayQueue, setDisplayQueue] = useState<ModelTexturePair[]>([]);
  const [currentMode, setCurrentMode] = useState<DisplayMode>('standard');
  const [isPaused, setIsPaused] = useState(false);
  const [lastNewTextureCheck, setLastNewTextureCheck] = useState(Date.now());
  const [lastShowcaseTrigger, setLastShowcaseTrigger] = useState(Date.now());
  const [newTextureIds, setNewTextureIds] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showcaseModeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queueInitializedRef = useRef(false);
  const mouseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const model3DRef = useRef<Model3DHandle>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  
  // Animation state
  const [modelHasAnimations, setModelHasAnimations] = useState(false);;
  const [modelIsPlaying, setModelIsPlaying] = useState(false);

  // Default settings (museum-optimized) - memoized to prevent infinite loops
  const settings = useMemo(() => ({
    standardMode: {
      duration: displayModes?.standardMode?.duration ?? 5,
      rotationSpeed: displayModes?.standardMode?.rotationSpeed ?? defaultRotationSpeed,
      enabled: displayModes?.standardMode?.enabled ?? true
    },
    newUploadMode: {
      duration: displayModes?.newUploadMode?.duration ?? 8,
      highlightEffect: displayModes?.newUploadMode?.highlightEffect ?? 'glow',
      soundAlert: displayModes?.newUploadMode?.soundAlert ?? false,
      enabled: displayModes?.newUploadMode?.enabled ?? true
    },
    showcaseMode: {
      enabled: displayModes?.showcaseMode?.enabled ?? true,
      frequency: displayModes?.showcaseMode?.frequency ?? 18, // minutes
      duration: displayModes?.showcaseMode?.duration ?? 60, // seconds
      textureInterval: displayModes?.showcaseMode?.textureInterval ?? 1.5
    },
    detailedMode: {
      duration: displayModes?.detailedMode?.duration ?? 8,
      featuredModels: displayModes?.detailedMode?.featuredModels ?? []
    },
    interactionSettings: {
      pauseOnTouch: displayModes?.interactionSettings?.pauseOnTouch ?? true,
      manualNavigation: displayModes?.interactionSettings?.manualNavigation ?? true,
      autoResumeAfter: displayModes?.interactionSettings?.autoResumeAfter ?? 15
    },
    textureCycling: {
      priorityTimeWindow: textureCycling?.priorityTimeWindow ?? 2, // hours
      priorityRepeatCount: textureCycling?.priorityRepeatCount ?? 6,
      standardDisplayDuration: textureCycling?.standardDisplayDuration ?? 5,
      enabled: textureCycling?.enabled ?? true
    }
  }), [displayModes, textureCycling, defaultRotationSpeed]);

  // Determine which mode to use: texture cycling or legacy model cycling
  const useTextureCycling = settings.textureCycling?.enabled && viewerId != null;

  // Fetch all models with all their textures when texture cycling is enabled
  useEffect(() => {
    if (!settings.textureCycling.enabled || !viewerId) {
      return;
    }

    async function fetchAllTextures(isBackgroundPoll: boolean) {
      // Skip background polls while offline — avoid failed requests and
      // retry loops draining performance on the TV.
      if (isBackgroundPoll && !getIsOnline()) {
        return;
      }
      try {
        const response = await fetch(`/api/viewer-models-all-textures/${viewerId}`);
        if (response.ok) {
          const data = await response.json();
          setAllModelsWithTextures(data.models || []);
        }
      } catch (err) {
        console.error('Error fetching all textures:', err);
      }
    }

    fetchAllTextures(false);

    // Poll for updates in the background — this never reloads the page, it
    // just silently swaps in new texture data.
    const interval = setInterval(() => fetchAllTextures(true), TEXTURE_POLL_INTERVAL_MS);

    // Resume immediately once connectivity is restored, instead of waiting
    // for the next scheduled poll.
    const unsubscribe = subscribeConnectivity((online) => {
      if (online) fetchAllTextures(true);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [viewerId, settings.textureCycling.enabled]);

  // Build display queue: priority textures (6x), then all textures in cycle
  useEffect(() => {
    if (!settings.textureCycling.enabled || allModelsWithTextures.length === 0) {
      queueInitializedRef.current = false;
      return;
    }

    const now = Date.now();
    const priorityThreshold = now - (settings.textureCycling.priorityTimeWindow * 60 * 60 * 1000);
    const queue: ModelTexturePair[] = [];
    
    // Collect all model-texture pairs
    const allPairs: ModelTexturePair[] = [];
    const priorityPairs: ModelTexturePair[] = [];
    
    for (const model of allModelsWithTextures) {
      if (model.textures.length === 0) {
        // Model with no textures - show with template
        allPairs.push({
          model,
          texture: null,
          isPriority: false
        });
      } else {
        // Model has textures - create pairs for each texture
        for (const texture of model.textures) {
          const uploadTime = new Date(texture.uploaded_at).getTime();
          const isPriority = uploadTime > priorityThreshold;
          
          const pair: ModelTexturePair = {
            model,
            texture,
            isPriority
          };
          
          allPairs.push(pair);
          if (isPriority) {
            priorityPairs.push(pair);
          }
        }
      }
    }

    // Sort priority pairs by upload time (newest first)
    priorityPairs.sort((a, b) => {
      const aTime = a.texture ? new Date(a.texture.uploaded_at).getTime() : 0;
      const bTime = b.texture ? new Date(b.texture.uploaded_at).getTime() : 0;
      return bTime - aTime;
    });

    // Add priority textures N times
    for (let i = 0; i < settings.textureCycling.priorityRepeatCount; i++) {
      queue.push(...priorityPairs);
    }

    // Then add all textures for full cycle
    queue.push(...allPairs);

    // Only update if this is first initialization or data actually changed
    if (!queueInitializedRef.current || queue.length !== displayQueue.length) {
      setDisplayQueue(queue);
      if (!queueInitializedRef.current) {
        setCurrentIndex(0);
        queueInitializedRef.current = true;
      }
    }
  }, [allModelsWithTextures, settings.textureCycling.priorityTimeWindow, settings.textureCycling.priorityRepeatCount, settings.textureCycling.enabled]);

  // Background-prefetch all textures into IndexedDB so Samsung Frame TV loads them instantly.
  // Runs whenever the display queue changes. Uses low concurrency (2) to stay responsive.
  useEffect(() => {
    if (!settings.textureCycling.enabled || displayQueue.length === 0) return;
    // Don't attempt prefetching while offline — there's nothing to fetch and
    // it would just generate failed network requests.
    if (!getIsOnline()) return;

    // Abort any previous prefetch run
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    // Collect unique texture URLs (skip placeholders and duplicates)
    const seen = new Set<string>();
    const toFetch: Array<{ url: string; modelId: string; textureId: string }> = [];
    for (const pair of displayQueue) {
      if (!pair.texture) continue;
      const url = pair.texture.corrected_texture_url && !pair.texture.corrected_texture_url.startsWith('local://')
        ? pair.texture.corrected_texture_url
        : pair.texture.original_photo_url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      toFetch.push({ url, modelId: pair.model.id, textureId: pair.texture.id });
    }

    if (toFetch.length > 0) {
      console.log(`[Carousel] Background prefetch: ${toFetch.length} unique textures`);
      prefetchTextures(toFetch, controller.signal).catch(err => {
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('[Carousel] Prefetch failed:', err);
        }
      });
    }

    return () => {
      controller.abort();
    };
  }, [displayQueue, settings.textureCycling.enabled]);

  // Look-ahead: pre-decode the next texture while the current one is on screen.
  // When the carousel advances, Model3D picks it from the preload cache instantly.
  useEffect(() => {
    if (!displayQueue.length) return;
    // Preload the next 2 items in the queue
    for (let ahead = 1; ahead <= 2; ahead++) {
      const nextPair = displayQueue[(currentIndex + ahead) % displayQueue.length];
      if (!nextPair?.texture) continue;
      const url = nextPair.texture.corrected_texture_url && !nextPair.texture.corrected_texture_url.startsWith('local://')
        ? nextPair.texture.corrected_texture_url
        : nextPair.texture.original_photo_url;
      if (url) preloadTexture(url).catch(() => {}); // fire-and-forget
    }
  }, [currentIndex, displayQueue]);

  // Sort models by texture upload time (newest first) and jump to newest when updated
  useEffect(() => {
    const sorted = [...models].sort((a, b) => {
      const aTime = a.latest_texture?.uploaded_at
        ? new Date(a.latest_texture.uploaded_at).getTime()
        : 0;
      const bTime = b.latest_texture?.uploaded_at
        ? new Date(b.latest_texture.uploaded_at).getTime()
        : 0;

      // Newest textures first
      if (aTime && bTime) return bTime - aTime;
      if (aTime) return -1;
      if (bTime) return 1;

      // Fall back to order_index
      return a.order_index - b.order_index;
    });

    // Check if there's a new texture (different from previous sortedModels[0])
    const previousNewest = sortedModels[0];
    const newNewest = sorted[0];

    // Only update if the data actually changed
    const hasChanged = !previousNewest || 
      !newNewest || 
      previousNewest.id !== newNewest.id ||
      previousNewest.latest_texture?.uploaded_at !== newNewest.latest_texture?.uploaded_at;

    if (hasChanged) {
      setSortedModels(sorted);
      
      // If there's a texture update (new or changed), jump to that model
      if (previousNewest && newNewest) {
        const hasNewTexture = previousNewest.id !== newNewest.id;
        const hasUpdatedTexture = previousNewest.id === newNewest.id && 
          previousNewest.latest_texture?.uploaded_at !== newNewest.latest_texture?.uploaded_at;
        
        if (hasNewTexture || hasUpdatedTexture) {
          // Always jump to the newest texture (index 0 in sorted array)
          setCurrentIndex(0);
        }
      }
    }
  }, [models]);

  // Detect new texture uploads
  useEffect(() => {
    if (!settings.newUploadMode.enabled) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const recentThreshold = now - 60000; // Last minute

      sortedModels.forEach(model => {
        if (model.latest_texture?.uploaded_at) {
          const uploadTime = new Date(model.latest_texture.uploaded_at).getTime();
          if (uploadTime > lastNewTextureCheck && uploadTime > recentThreshold) {
            setNewTextureIds(prev => new Set(prev).add(model.id));
            setCurrentMode('new-upload');
            // Find and display the new texture
            const index = sortedModels.findIndex(m => m.id === model.id);
            if (index !== -1) setCurrentIndex(index);
          }
        }
      });

      setLastNewTextureCheck(now);
    }, 5000); // Check every 5 seconds

    return () => clearInterval(checkInterval);
  }, [sortedModels, settings.newUploadMode.enabled]);

  // Showcase mode timer
  useEffect(() => {
    if (!settings.showcaseMode.enabled) return;

    const scheduleShowcase = () => {
      const delay = settings.showcaseMode.frequency * 60 * 1000; // Convert to ms
      
      showcaseModeTimeoutRef.current = setTimeout(() => {
        if (!isPaused) {
          setCurrentMode('showcase');
          
          // Auto-exit showcase mode after duration
          setTimeout(() => {
            setCurrentMode('standard');
            setLastShowcaseTrigger(Date.now());
            scheduleShowcase();
          }, settings.showcaseMode.duration * 1000);
        }
      }, delay);
    };

    scheduleShowcase();

    return () => {
      if (showcaseModeTimeoutRef.current) {
        clearTimeout(showcaseModeTimeoutRef.current);
      }
    };
  }, [settings.showcaseMode, isPaused]);

  // Get current display duration based on mode
  const getCurrentDuration = useCallback(() => {
    const currentModel = sortedModels[currentIndex];
    
    switch (currentMode) {
      case 'new-upload':
        return settings.newUploadMode.duration;
      case 'showcase':
        return settings.showcaseMode.textureInterval;
      case 'detailed':
        if (currentModel && settings.detailedMode.featuredModels.includes(currentModel.id)) {
          return settings.detailedMode.duration;
        }
        return settings.standardMode.duration;
      case 'standard':
      default:
        return settings.standardMode.duration;
    }
  }, [currentMode, currentIndex, sortedModels, settings]);

  // Carousel timer - switch to next model or texture pair
  useEffect(() => {
    const itemCount = useTextureCycling ? displayQueue.length : sortedModels.length;
    if (itemCount <= 1 || isPaused) return;

    const duration = useTextureCycling 
      ? settings.textureCycling.standardDisplayDuration
      : getCurrentDuration();
    
    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % itemCount;
        
        // Check if we should exit new-upload mode (legacy mode only)
        if (!useTextureCycling && currentMode === 'new-upload') {
          const nextModel = sortedModels[next];
          if (!newTextureIds.has(nextModel.id)) {
            setCurrentMode('standard');
            setNewTextureIds(new Set());
          }
        }
        
        return next;
      });
    }, duration * 1000);

    return () => clearInterval(timer);
  }, [useTextureCycling, displayQueue.length, sortedModels.length, isPaused, getCurrentDuration, currentMode, newTextureIds, settings.textureCycling.standardDisplayDuration]);

  // Manual navigation
  const goToPrevious = useCallback(() => {
    if (!settings.interactionSettings.manualNavigation) return;
    
    const itemCount = useTextureCycling ? displayQueue.length : sortedModels.length;
    setIsPaused(true);
    setCurrentIndex(prev => prev === 0 ? itemCount - 1 : prev - 1);
    
    // Auto-resume after timeout
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, settings.interactionSettings.autoResumeAfter * 1000);
  }, [useTextureCycling, displayQueue.length, sortedModels.length, settings.interactionSettings]);

  const goToNext = useCallback(() => {
    if (!settings.interactionSettings.manualNavigation) return;
    
    const itemCount = useTextureCycling ? displayQueue.length : sortedModels.length;
    setIsPaused(true);
    setCurrentIndex(prev => (prev + 1) % itemCount);
    
    // Auto-resume after timeout
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, settings.interactionSettings.autoResumeAfter * 1000);
  }, [useTextureCycling, displayQueue.length, sortedModels.length, settings.interactionSettings]);

  const toggleFullscreen = useCallback(() => {
    const elem = document.documentElement;
    
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement && 
        !(document as any).mozFullScreenElement && !(document as any).msFullscreenElement) {
      // Entering fullscreen - Try multiple fullscreen methods for Samsung TV compatibility
      console.log('Attempting to enter fullscreen...');
      
      if (elem.requestFullscreen) {
        console.log('Using standard requestFullscreen');
        elem.requestFullscreen().catch(err => {
          console.error('Error entering fullscreen:', err);
        });
      } else if ((elem as any).webkitRequestFullscreen) {
        console.log('Using webkitRequestFullscreen');
        (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).mozRequestFullScreen) {
        console.log('Using mozRequestFullScreen');
        (elem as any).mozRequestFullScreen();
      } else if ((elem as any).msRequestFullscreen) {
        console.log('Using msRequestFullscreen');
        (elem as any).msRequestFullscreen();
      } else {
        console.error('No fullscreen API available');
      }
    } else {
      // Exiting fullscreen - Try multiple exit methods
      console.log('Attempting to exit fullscreen...');
      
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  }, []);

  // Auto re-enter fullscreen after a page reload triggered by WebGL recovery or preventive reload.
  // Samsung Frame TV cannot re-enter fullscreen without a user gesture, so we use a stored flag
  // set just before the reload to re-invoke the fullscreen request on the new page load.
  useEffect(() => {
    const shouldRestore = sessionStorage.getItem('requestFullscreenOnLoad');
    if (shouldRestore) {
      sessionStorage.removeItem('requestFullscreenOnLoad');
      // Short delay to let the page fully render before requesting fullscreen
      const timer = setTimeout(() => {
        toggleFullscreen();
      }, 1500);
      return () => clearTimeout(timer);
    }
  // toggleFullscreen is stable (useCallback with [] deps) — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle animation state changes from Model3D
  const handleAnimationStateChange = useCallback((hasAnimations: boolean, isPlaying: boolean) => {
    setModelHasAnimations(hasAnimations);
    setModelIsPlaying(isPlaying);
  }, []);

  // Play animation manually
  const handlePlayAnimation = useCallback(() => {
    if (model3DRef.current) {
      model3DRef.current.playAnimation();
    }
  }, []);

  // Track fullscreen state and handle mouse movement
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Check all vendor-prefixed fullscreen properties
      const isFullscreenActive = !!(document.fullscreenElement || 
        (document as any).webkitFullscreenElement || 
        (document as any).mozFullScreenElement || 
        (document as any).msFullscreenElement);
      
      setIsFullscreen(isFullscreenActive);
      if (!isFullscreenActive) {
        setShowControls(true);
      }
    };

    const handleMouseMove = () => {
      // Check all vendor-prefixed fullscreen properties
      const isFullscreenActive = !!(document.fullscreenElement || 
        (document as any).webkitFullscreenElement || 
        (document as any).mozFullScreenElement || 
        (document as any).msFullscreenElement);
      
      if (isFullscreenActive) {
        setShowControls(true);
        
        // Clear existing timeout
        if (mouseTimeoutRef.current) {
          clearTimeout(mouseTimeoutRef.current);
        }
        
        // Hide controls after 3 seconds of inactivity
        mouseTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    // Listen to all vendor-prefixed fullscreen events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchstart', handleMouseMove);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchstart', handleMouseMove);
      if (mouseTimeoutRef.current) {
        clearTimeout(mouseTimeoutRef.current);
      }
    };
  }, []);

  // Get current display item based on mode (needed for debug logging)
  const currentPair = useTextureCycling ? displayQueue[currentIndex] : null;
  const currentLegacyModel = !useTextureCycling ? sortedModels[currentIndex] : null;
  const currentModel = useTextureCycling && currentPair ? currentPair.model : currentLegacyModel;
  
  // Debug: Log texture data to check author info
  useEffect(() => {
    if (currentPair?.texture) {
      console.log('Current texture (cycling mode):', {
        id: currentPair.texture.id,
        author_name: currentPair.texture.author_name,
        author_age: currentPair.texture.author_age
      });
    }
    if (currentLegacyModel?.latest_texture) {
      console.log('Current texture (legacy mode):', {
        id: currentLegacyModel.latest_texture.id,
        author_name: currentLegacyModel.latest_texture.author_name,
        author_age: currentLegacyModel.latest_texture.author_age
      });
    }
  }, [currentPair, currentLegacyModel]);

  // Check if we have texture data ready
  if (useTextureCycling && displayQueue.length === 0) {
    return (
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor 
        }}
      >
        <div style={{ color: '#ffffff', textAlign: 'center' }}>
          <p style={{ fontSize: '48px' }}>Loading textures...</p>
        </div>
      </div>
    );
  }

  if (!useTextureCycling && sortedModels.length === 0) {
    return (
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor 
        }}
      >
        <div style={{ color: '#ffffff', textAlign: 'center' }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>No 3D models uploaded yet</p>
          <p style={{ fontSize: '28px', opacity: 0.7 }}>Upload models to begin</p>
        </div>
      </div>
    );
  }
  
  // Helper to get valid texture URL (skip local:// placeholder URLs)
  const getValidTextureUrl = (texture: { corrected_texture_url?: string; original_photo_url?: string } | null, templateUrl: string | null): string | null => {
    if (texture) {
      // If corrected texture is a local placeholder, fall back to original photo
      if (texture.corrected_texture_url && !texture.corrected_texture_url.startsWith('local://')) {
        return texture.corrected_texture_url;
      }
      // Fall back to original photo URL
      if (texture.original_photo_url) {
        return texture.original_photo_url;
      }
    }
    // Fall back to template
    return templateUrl || null;
  };

  const textureUrl = useTextureCycling && currentPair
    ? getValidTextureUrl(currentPair.texture, currentPair.model.texture_template_url)
    : getValidTextureUrl(currentLegacyModel?.latest_texture || null, currentLegacyModel?.texture_template_url || null);
  
  const textureId = useTextureCycling && currentPair?.texture
    ? currentPair.texture.id
    : (currentLegacyModel?.latest_texture?.id || '');
  
  const textureUploadDate = useTextureCycling && currentPair?.texture
    ? currentPair.texture.uploaded_at
    : currentLegacyModel?.latest_texture?.uploaded_at;
  
  const currentRotationSpeed = currentMode === 'showcase' 
    ? settings.standardMode.rotationSpeed * 1.5 
    : settings.standardMode.rotationSpeed;
  
  const isHighlighted = useTextureCycling && currentPair 
    ? currentPair.isPriority
    : (currentMode === 'new-upload' && currentModel && newTextureIds.has(currentModel.id));
  
  // Calculate unique textures count for display
  const totalItems = useTextureCycling 
    ? (() => {
        // Count unique texture IDs in the queue
        const uniqueTextures = new Set(
          displayQueue
            .filter(pair => pair.texture)
            .map(pair => pair.texture!.id)
        );
        return uniqueTextures.size;
      })()
    : sortedModels.length;
  
  if (!currentModel) {
    return (
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor 
        }}
      >
        <div style={{ color: '#ffffff', textAlign: 'center' }}>
          <p style={{ fontSize: '48px' }}>No model available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ backgroundColor, cursor: isFullscreen && !showControls ? 'none' : 'default' }}>
      <Canvas 
        shadows 
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
        gl={{
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance'
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
        
        {/* Simple ambient light */}
        <ambientLight />
        
        {/* Hemisphere light - sky/ground illumination */}
        <hemisphereLight 
          args={[0xffffff, 0x444444, ambientLightIntensity * 3]} 
        />
        
        {/* Key light - soft spotlight with penumbra for diffused edges */}
        <spotLight 
          position={[20, 30, 20]} 
          intensity={directionalLightIntensity * 3}
          angle={0.6}
          penumbra={1}
          decay={0}
        />
        
        {/* Fill light - soft from front-left */}
        <spotLight 
          position={[-20, 20, 20]} 
          intensity={directionalLightIntensity * 2}
          angle={0.6}
          penumbra={1}
          decay={0}
        />
        
        {/* Back light - soft illumination from back */}
        <spotLight 
          position={[0, 10, -30]} 
          intensity={directionalLightIntensity * 2}
          angle={0.6}
          penumbra={1}
          decay={0}
        />
        
        {/* Bottom fill light - soft from below */}
        <spotLight 
          position={[0, -20, 10]} 
          intensity={directionalLightIntensity * 1.5}
          angle={0.8}
          penumbra={1}
          decay={0}
        />
        
        {/* 3D Model */}
        <Model3D 
          ref={model3DRef}
          modelUrl={currentModel.model_file_url} 
          textureUrl={textureUrl || null}
          rotationSpeed={currentRotationSpeed}
          modelId={currentModel.id}
          textureId={textureId}
          onAnimationStateChange={handleAnimationStateChange}
          onLoadingChange={setIsModelLoading}
        />
        
        {/* Camera controls (optional - can disable for pure auto-rotation) */}
        <OrbitControls 
          enableZoom={true}
          enablePan={false}
          autoRotate={false}
          minDistance={3}
          maxDistance={20}
        />
      </Canvas>

      {/* Subtle loading indicator: soft blurred pulsing glow instead of a hard spinner.
          Barely visible on a dark background — just enough to indicate activity. */}
      {isModelLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="animate-pulse rounded-full"
            style={{
              width: '56px',
              height: '56px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.0) 70%)',
              filter: 'blur(10px)',
            }}
          />
        </div>
      )}
      
      {/* Highlight effect for new uploads */}
      {isHighlighted && settings.newUploadMode.highlightEffect !== 'none' && (
        <div 
          className={`absolute inset-0 pointer-events-none ${
            settings.newUploadMode.highlightEffect === 'glow' ? 'animate-pulse' :
            settings.newUploadMode.highlightEffect === 'pulse' ? 'animate-ping' : ''
          }`}
          style={{
            boxShadow: settings.newUploadMode.highlightEffect === 'glow' 
              ? 'inset 0 0 60px rgba(59, 130, 246, 0.5)' 
              : undefined,
            border: settings.newUploadMode.highlightEffect === 'border' 
              ? '4px solid rgba(59, 130, 246, 0.8)' 
              : undefined
          }}
        />
      )}

      {/* Fullscreen button */}
      {(!isFullscreen || showControls) && (
        <button
          onClick={toggleFullscreen}
          className="text-white p-3 rounded-lg transition-opacity duration-300"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer'
          }}
          aria-label="Toggle fullscreen"
        >
          <Maximize className="h-6 w-6" style={{ width: '24px', height: '24px' }} />
        </button>
      )}

      {/* Play animation button - only show when model has animations and not currently playing */}
      {modelHasAnimations && !modelIsPlaying && (!isFullscreen || showControls) && (
        <button
          onClick={handlePlayAnimation}
          className="text-white p-3 rounded-lg transition-opacity duration-300"
          style={{
            position: 'absolute',
            top: '16px',
            right: '80px',
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer'
          }}
          aria-label="Play animation"
          title="Play animation"
        >
          <Play className="h-6 w-6" style={{ width: '24px', height: '24px' }} />
        </button>
      )}

      {/* Author info overlay - Bottom Left */}
      {useTextureCycling && currentPair?.texture && (currentPair.texture.author_name || currentPair.texture.author_age || currentPair.texture.queue_number) && (
        <div 
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '40px',
            zIndex: 30,
            maxWidth: '80%'
          }}
        >
          <div style={{
            color: '#4b5563',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '80px',
            lineHeight: '1.2'
          }}>
            {currentPair.texture.queue_number && (
              <span style={{ marginRight: '20px', fontSize: '80px' }}>
                #{currentPair.texture.queue_number}
              </span>
            )}
            {currentPair.texture.author_name}
            {currentPair.texture.author_age && (
              <span style={{ marginLeft: '20px', fontSize: '80px', fontWeight: '600' }}>
                - {currentPair.texture.author_age}
              </span>
            )}
          </div>
        </div>
      )}
      
      {!useTextureCycling && currentLegacyModel?.latest_texture && (currentLegacyModel.latest_texture.author_name || currentLegacyModel.latest_texture.author_age || currentLegacyModel.latest_texture.queue_number) && (
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '40px',
            zIndex: 30,
            maxWidth: '80%'
          }}
        >
          {currentLegacyModel.latest_texture.queue_number && (
            <div style={{
              color: '#4b5563',
              fontSize: '80px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px'
            }}>
              #{currentLegacyModel.latest_texture.queue_number}
            </div>
          )}
          {currentLegacyModel.latest_texture.author_name && (
            <div style={{
              color: '#4b5563',
              fontSize: '80px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {currentLegacyModel.latest_texture.author_name}
            </div>
          )}
          {currentLegacyModel.latest_texture.author_age && (
            <div style={{
              color: '#4b5563',
              fontSize: '60px',
              fontWeight: '600',
              textTransform: 'uppercase',
              marginTop: '10px'
            }}>
              AGE {currentLegacyModel.latest_texture.author_age}
            </div>
          )}
        </div>
      )}

      {/* Logo overlay - bottom right corner */}
      {logoUrl && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            zIndex: 30
          }}
        >
          <img 
            src={logoUrl} 
            alt="Logo" 
            style={{
              height: '80px',
              width: 'auto',
              objectFit: 'contain',
              maxWidth: '300px'
            }}
          />
        </div>
      )}
      
    </div>
  );
}
