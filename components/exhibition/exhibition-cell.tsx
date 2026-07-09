'use client';

import { PerspectiveCamera } from '@react-three/drei';
import { Model3D } from '@/components/model-3d';
import type { ExhibitionCellConfig } from '@/lib/types/exhibition';
import type { ViewerModelWithAllTextures } from '@/lib/types/viewer';
import { useCellTexture } from './use-cell-texture';

interface ExhibitionCellSceneProps {
  cell: ExhibitionCellConfig;
  model: ViewerModelWithAllTextures | undefined;
  textureMaxDim: number;
  textureQuality: number;
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
export function ExhibitionCellScene({ cell, model, textureMaxDim, textureQuality, paused, forceAdvanceSignal }: ExhibitionCellSceneProps) {
  const { url: textureUrl, textureId } = useCellTexture({ cell, model, textureMaxDim, textureQuality, forceAdvanceSignal });
  const rotationSpeed = !paused && cell.rotation.enabled ? cell.rotation.speed * cell.rotation.direction : 0;

  if (!model) return null;

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
      <ambientLight />
      <hemisphereLight args={[0xffffff, 0x444444, 1.4]} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} />
      <Model3D
        modelUrl={model.model_file_url}
        textureUrl={textureUrl}
        rotationSpeed={rotationSpeed}
        modelId={model.id}
        textureId={textureId}
      />
    </>
  );
}
