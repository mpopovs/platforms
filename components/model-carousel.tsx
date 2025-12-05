'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import type { ViewerModelWithTexture, DisplayModeSettings, TextureCyclingSettings, ViewerModelWithAllTextures, ModelTexturePair } from '@/lib/types/viewer';
import { Maximize, Play } from 'lucide-react';
import { Model3D, Model3DHandle } from './model-3d';

interface ModelCarouselProps {
  models: ViewerModelWithTexture[];
  rotationSpeed?: number;
  displayDuration?: number; // seconds (deprecated - use displayModes)
  backgroundColor?: string;
  displayModes?: DisplayModeSettings;
  textureCycling?: TextureCyclingSettings;
  viewerId?: string; // Required for fetching all textures
  logoUrl?: string | null; // Logo to display in bottom-right corner
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
  logoUrl
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
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showcaseModeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queueInitializedRef = useRef(false);
  const mouseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const model3DRef = useRef<Model3DHandle>(null);
  
  // Animation state
  const [modelHasAnimations, setModelHasAnimations] = useState(false);
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

    async function fetchAllTextures() {
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

    fetchAllTextures();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchAllTextures, 30000);
    return () => clearInterval(interval);
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
      if (previousNewest && newNewest && previousNewest.id !== newNewest.id) {
        // Jump to the new texture immediately
        setCurrentIndex(0);
      } else if (previousNewest && newNewest && previousNewest.id === newNewest.id) {
        // Check if texture was updated for the same model
        const prevTextureTime = previousNewest.latest_texture?.uploaded_at;
        const newTextureTime = newNewest.latest_texture?.uploaded_at;
        if (prevTextureTime !== newTextureTime) {
          setCurrentIndex(0);
        }
      }

      setSortedModels(sorted);
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
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error('Error entering fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
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
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        setShowControls(true);
      }
    };

    const handleMouseMove = () => {
      if (document.fullscreenElement) {
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

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('mousemove', handleMouseMove);
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
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <div className="text-white text-center">
          <p className="text-xl">Loading textures...</p>
        </div>
      </div>
    );
  }

  if (!useTextureCycling && sortedModels.length === 0) {
    return (
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <div className="text-white text-center">
          <p className="text-xl">No 3D models uploaded yet</p>
          <p className="text-sm mt-2 opacity-70">Upload models to begin</p>
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
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor }}
      >
        <div className="text-white text-center">
          <p className="text-xl">No model available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ backgroundColor }}>
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        
        {/* Lighting - Ambient + Left/Right */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[-5, 2, 2]} intensity={0.8} /> {/* Left light */}
        <directionalLight position={[5, 2, 2]} intensity={0.8} />  {/* Right light */}
        
        {/* 3D Model */}
        <Model3D 
          ref={model3DRef}
          modelUrl={currentModel.model_file_url} 
          textureUrl={textureUrl || null}
          rotationSpeed={currentRotationSpeed}
          modelId={currentModel.id}
          textureId={textureId}
          onAnimationStateChange={handleAnimationStateChange}
        />
        
        {/* Camera controls (optional - can disable for pure auto-rotation) */}
        <OrbitControls 
          enableZoom={true}
          enablePan={false}
          autoRotate={false}
          minDistance={2}
          maxDistance={10}
        />
      </Canvas>
      
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
      <button
        onClick={toggleFullscreen}
        className={`absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-sm transition-all duration-300 ${
          isFullscreen && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-label="Toggle fullscreen"
      >
        <Maximize className="h-5 w-5" />
      </button>

      {/* Play animation button - only show when model has animations and not currently playing */}
      {modelHasAnimations && !modelIsPlaying && (
        <button
          onClick={handlePlayAnimation}
          className={`absolute top-4 right-16 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-sm transition-all duration-300 ${
            isFullscreen && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          aria-label="Play animation"
          title="Play animation"
        >
          <Play className="h-5 w-5" />
        </button>
      )}

      {/* Author info overlay - Bottom Left */}
    {useTextureCycling && currentPair?.texture && (currentPair.texture.author_name || currentPair.texture.author_age) && (
  <div className="absolute bottom-4 left-4 text-gray-700">
    <div> 
      <p className="font-bold uppercase tracking-wide text-[3cm] leading-none drop-shadow-md">
        {currentPair.texture.author_name}
        {currentPair.texture.author_age && (
          <span className="text-[3cm] font-semibold ml-4">
            - {currentPair.texture.author_age}
          </span>
        )}
      </p>
    </div>
  </div>
)}
      
      {!useTextureCycling && currentLegacyModel?.latest_texture && (currentLegacyModel.latest_texture.author_name || currentLegacyModel.latest_texture.author_age) && (
        <div className="absolute bottom-4 left-4 text-white">
          <div className="px-6 py-4 rounded-lg backdrop-blur-sm bg-black/70">
            <p className="text-3xl font-bold uppercase tracking-wide">
              {currentLegacyModel.latest_texture.author_name}
            </p>
            {currentLegacyModel.latest_texture.author_age && (
              <p className="text-2xl font-semibold uppercase mt-1">
                AGE {currentLegacyModel.latest_texture.author_age}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Logo overlay - bottom right corner */}
      {logoUrl && (
        <div className="absolute bottom-4 right-4">
          <img 
            src={logoUrl} 
            alt="Logo" 
            className="h-16 w-auto object-contain"
          />
        </div>
      )}
      
    </div>
  );
}
