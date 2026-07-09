// Exhibition Grid types — the multi-model gallery/show display mode.
// See ARUCO_INTEGRATION.md-style docs (to be added) for a user-facing guide.

// ─── Grid layout ─────────────────────────────────────────────────────────────

/**
 * A single cell's placement in the virtual grid. Uses CSS-grid-like
 * col/row + span so layouts can be uniform (2x2, 3x3, ...) or asymmetric
 * (one large "hero" cell + several smaller ones), and so cells can be
 * added/removed/rearranged at runtime by mutating this array — no page
 * reload required.
 */
export interface GridCellRect {
  /** Stable id, referenced by ExhibitionCellConfig.cellId */
  id: string;
  /** 0-based starting column */
  col: number;
  /** 0-based starting row */
  row: number;
  /** Default 1 */
  colSpan?: number;
  /** Default 1 */
  rowSpan?: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
  cells: GridCellRect[];
}

export type GridPresetKey =
  | '1x2'
  | '2x2'
  | '2x3'
  | '3x3'
  | '4x4'
  | '4x5'
  | 'hero-plus-5'
  | 'hero-plus-9';

function uniformGrid(columns: number, rows: number): GridLayout {
  const cells: GridCellRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      cells.push({ id: `cell-${row}-${col}`, col, row });
    }
  }
  return { columns, rows, cells };
}

/** One large hero cell (top-left, 2x2) plus `count` smaller cells filling the rest of a 4-column grid. */
function heroPlusGrid(count: number): GridLayout {
  const columns = 4;
  const cells: GridCellRect[] = [
    { id: 'cell-hero', col: 0, row: 0, colSpan: 2, rowSpan: 2 },
  ];
  // Walk the grid row-major, skipping the 2x2 area the hero cell occupies,
  // until `count` extra cells have been placed.
  let placed = 0;
  let row = 0;
  for (; placed < count; row++) {
    for (let col = 0; col < columns && placed < count; col++) {
      const insideHero = row < 2 && col < 2;
      if (insideHero) continue;
      cells.push({ id: `cell-extra-${placed}`, col, row });
      placed++;
    }
  }
  const rows = Math.max(2, row);
  return { columns, rows, cells };
}

export const GRID_PRESETS: Record<GridPresetKey, GridLayout> = {
  '1x2': uniformGrid(2, 1),
  '2x2': uniformGrid(2, 2),
  '2x3': uniformGrid(3, 2),
  '3x3': uniformGrid(3, 3),
  '4x4': uniformGrid(4, 4),
  '4x5': uniformGrid(5, 4),
  'hero-plus-5': heroPlusGrid(5),
  'hero-plus-9': heroPlusGrid(9),
};

export const MAX_EXHIBITION_CELLS = 20;

// ─── Per-cell config ─────────────────────────────────────────────────────────

export type TextureMode = 'original-locked' | 'user-uploads';
export type TextureCycleStrategy = 'cycle' | 'random' | 'newest-first';

export interface ExhibitionCellConfig {
  /** Matches a GridCellRect.id in the parent ExhibitionConfig.layout */
  cellId: string;
  viewerId: string;
  modelId: string;
  textureMode: TextureMode;
  /**
   * Required when textureMode === 'original-locked'. The specific
   * model_textures.id the curator pinned as this cell's single canonical
   * texture — never overridden by uploads/cycling regardless of config bugs
   * elsewhere, since useCellTexture() only reads this field for locked cells.
   * If unset, falls back to the model's texture_template_url.
   */
  lockedTextureId?: string;
  cycling: {
    strategy: TextureCycleStrategy;
    intervalSec: number;
  };
  rotation: {
    enabled: boolean;
    speed: number; // same unit as the existing single-model viewer's rotationSpeed
    direction: 1 | -1;
  };
}

export function createDefaultCellConfig(cellId: string, viewerId: string, modelId: string): ExhibitionCellConfig {
  return {
    cellId,
    viewerId,
    modelId,
    textureMode: 'original-locked',
    cycling: { strategy: 'newest-first', intervalSec: 12 },
    rotation: { enabled: true, speed: 0.3, direction: 1 },
  };
}

// ─── Global tunables ─────────────────────────────────────────────────────────

export interface ExhibitionTunables {
  /** Default max texture dimension (px) requested via getStorageThumbnailUrl per cell. */
  defaultTextureMaxDim: number;
  /** JPEG/WebP quality (1-100) requested for cell textures via getStorageThumbnailUrl. */
  textureQuality: number;
  targetFps: number;
  minFps: number;
  fpsSampleWindowMs: number;
  /** Quality step-down ladder for texture max-dim, applied cell-by-cell when fps < minFps. Index 0 must equal defaultTextureMaxDim. */
  qualityStepDownTextureDims: number[];
  /** How many cells may decode/fetch a new texture concurrently (avoids network/GPU spikes). */
  preloadConcurrency: number;
  /** Poll interval for the 'user-uploads' texture pool per viewer. */
  userUploadsPollIntervalMs: number;
}

export const DEFAULT_EXHIBITION_TUNABLES: ExhibitionTunables = {
  defaultTextureMaxDim: 2048,
  textureQuality: 75,
  targetFps: 60,
  minFps: 30,
  fpsSampleWindowMs: 3000,
  qualityStepDownTextureDims: [2048, 1024, 768, 512],
  preloadConcurrency: 3,
  userUploadsPollIntervalMs: 30_000,
};

// ─── Full config ─────────────────────────────────────────────────────────────

export interface ExhibitionConfig {
  id: string;
  userId: string;
  name: string;
  layout: GridLayout;
  cells: ExhibitionCellConfig[];
  tunables: ExhibitionTunables;
  /** The /exhibition show route's access token. Only ever surfaced to the owner (list/get-by-id APIs), never echoed back by the public get-by-token lookup. */
  accessToken: string;
  createdAt: number;
  updatedAt: number;
}

/** DB row shape (snake_case columns + jsonb config blob). */
export interface ExhibitionConfigRow {
  id: string;
  user_id: string;
  name: string;
  config: {
    layout: GridLayout;
    cells: ExhibitionCellConfig[];
    tunables: ExhibitionTunables;
  };
  access_token: string;
  created_at: string;
  updated_at: string;
}

export function generateExhibitionConfigId(): string {
  return `exhibition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
