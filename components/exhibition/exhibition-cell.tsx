'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { PerspectiveCamera } from '@react-three/drei';
import { Model3D } from '@/components/model-3d';
import type { ExhibitionCellConfig, TextureChangeBlinkConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { useCellTexture } from './use-cell-texture';

interface ExhibitionCellSceneProps {
  cell: ExhibitionCellConfig;
  model: ViewerModelWithAllTextures | undefined;
  textureMaxDim: number;
  textureQuality: number;
  /** Exhibition-wide size multiplier on top of Model3D's automatic fit-to-view size (1 = default). */
  modelScale: number;
  textureChangeBlink: TextureChangeBlinkConfig;
  /** Exhibition-wide: vary each timed texture change around the cell's interval. */
  randomTextureTiming: boolean;
  /** Set to the blink length when a different texture appears; ExhibitionCellRenderer skips drawing the cell while it counts down. */
  blinkFramesRef: RefObject<number>;
  /** Curator hotkey: freezes rotation on every cell regardless of its own rotation.enabled setting. */
  paused: boolean;
  /** Curator hotkey: bumped to force every 'user-uploads' cell to immediately advance to its next texture. */
  forceAdvanceSignal: number;
}

/**
 * The 3D content of a single grid cell: its own camera + lights + model.
 * Rendered inside a drei <View> tracking this cell's DOM rectangle — the
 * parent <ExhibitionGrid> owns the single shared WebGL canvas/context.
 *
 * Lighting is intentionally minimal (3 cheap, shadow-less lights) since this
 * cost is multiplied by up to 20 simultaneous cells.
 */
export function ExhibitionCellScene({
  cell,
  model,
  textureMaxDim,
  textureQuality,
  modelScale,
  textureChangeBlink,
  randomTextureTiming,
  blinkFramesRef,
  paused,
  forceAdvanceSignal,
}: ExhibitionCellSceneProps) {
  const { url: textureUrl, textureId } = useCellTexture({
    cell,
    model,
    textureMaxDim,
    textureQuality,
    forceAdvanceSignal,
    randomTiming: randomTextureTiming,
  });
  const rotationSpeed = !paused && cell.rotation.enabled ? cell.rotation.speed * cell.rotation.direction : 0;

  // Blink only when a *different* texture arrives — not on the first texture, and not when the
  // quality ladder (or going offline) re-requests the same texture at another resolution.
  const blinkPendingRef = useRef(false);
  const isFirstTextureIdRef = useRef(true);
  useEffect(() => {
    if (isFirstTextureIdRef.current) {
      isFirstTextureIdRef.current = false;
      return;
    }
    blinkPendingRef.current = true;
  }, [textureId]);

  const handleTextureApplied = () => {
    if (blinkPendingRef.current && textureChangeBlink.enabled) blinkFramesRef.current = textureChangeBlink.frames;
    blinkPendingRef.current = false;
  };

  if (!model) return null;

  return (
    <>
      {/*
        Object size is a camera zoom, not a scaled group around the model: Model3D
        fits each model to 4 units using its world-space bounding box when it
        loads, so a scaled parent would be measured and cancelled out — models
        loaded after the size was set (every model on a fresh page) would show
        at 100%. Zoom enlarges the view around the cell's center instead.
      */}
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} zoom={modelScale} />
      <ambientLight />
      <hemisphereLight args={[0xffffff, 0x444444, 1.4]} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} />
      <Model3D
        modelUrl={model.model_file_url}
        textureUrl={textureUrl}
        rotationSpeed={rotationSpeed}
        modelId={model.id}
        textureId={textureId}
        // Texture cycling and quality steps swap the texture in place — don't blank the model while the next one loads.
        keepTextureWhileLoading
        onTextureApplied={handleTextureApplied}
      />
    </>
  );
}
