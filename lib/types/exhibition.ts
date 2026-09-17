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

/** 'cycle' and 'random' change texture on the cell's interval; 'newest-first' only changes when a new upload arrives. */
export function cyclingUsesInterval(strategy: TextureCycleStrategy): boolean {
  return strategy !== 'newest-first';
}

/** With random timing, each wait is between (1 - spread) and (1 + spread) times the cell's interval. */
export const RANDOM_TEXTURE_TIMING_SPREAD = 0.5;

/**
 * Milliseconds until a cell's next timed texture change. With random timing
 * every wait is picked separately, so cells sharing the same interval drift
 * apart and change at different moments instead of all at once.
 */
export function nextTextureChangeDelayMs(intervalSec: number, randomTiming: boolean, random: () => number = Math.random): number {
  const baseMs = Math.max(1, intervalSec) * 1000;
  if (!randomTiming) return baseMs;
  return Math.round(baseMs * (1 - RANDOM_TEXTURE_TIMING_SPREAD + 2 * RANDOM_TEXTURE_TIMING_SPREAD * random()));
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

// ─── Display settings (whole grid) ───────────────────────────────────────────

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export const MODEL_SCALE_MIN = 0.2;
export const MODEL_SCALE_MAX = 3;
export const DEFAULT_MODEL_SCALE = 1;

/** Coerces a stored/imported/client-supplied model scale (older rows have none) into the supported range. */
export function normalizeModelScale(value: unknown): number {
  return clampFinite(value, MODEL_SCALE_MIN, MODEL_SCALE_MAX, DEFAULT_MODEL_SCALE);
}

export const DEFAULT_BACKGROUND_COLOR = '#000000';

/** Accepts `#rrggbb` (as produced by <input type="color">); anything else falls back to black. */
export function normalizeBackgroundColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_BACKGROUND_COLOR;
}

export interface TextureChangeBlinkConfig {
  /** Hide a cell's model briefly whenever it switches to a different texture. */
  enabled: boolean;
  /** How many rendered frames the model stays hidden (the cell shows the background meanwhile). */
  frames: number;
}

export const TEXTURE_CHANGE_BLINK_FRAMES_MIN = 1;
export const TEXTURE_CHANGE_BLINK_FRAMES_MAX = 120;

export const DEFAULT_TEXTURE_CHANGE_BLINK: TextureChangeBlinkConfig = { enabled: false, frames: 4 };

export function normalizeTextureChangeBlink(input?: Partial<TextureChangeBlinkConfig> | null): TextureChangeBlinkConfig {
  return {
    enabled: input?.enabled === true,
    frames: Math.round(
      clampFinite(input?.frames, TEXTURE_CHANGE_BLINK_FRAMES_MIN, TEXTURE_CHANGE_BLINK_FRAMES_MAX, DEFAULT_TEXTURE_CHANGE_BLINK.frames)
    ),
  };
}

/** Off unless explicitly turned on (older rows and imported files keep changing in step). */
export function normalizeRandomTextureTiming(value: unknown): boolean {
  return value === true;
}

/** Older rows and imported files without the setting show the indicator. */
export function normalizeShowConnectionIndicator(value: unknown): boolean {
  return value !== false;
}

export interface WaterfallConfig {
  /** When true the whole grid scrolls downward in an endless loop. */
  enabled: boolean;
  /**
   * Percent of the grid's height travelled per second (5 = one full loop
   * every 20s with no loop gap). Relative to the grid rather than pixels so
   * the curation page's small live preview moves exactly like the show.
   */
  speed: number;
  /** Empty space between the end of one pass and the start of the next, as a percent of the grid's height (0 = seamless). */
  loopGap: number;
}

export const WATERFALL_SPEED_MIN = 0.5;
export const WATERFALL_SPEED_MAX = 40;
export const WATERFALL_LOOP_GAP_MAX = 100;

export const DEFAULT_WATERFALL_CONFIG: WaterfallConfig = { enabled: false, speed: 5, loopGap: 0 };

/** Coerces stored/imported/client-supplied waterfall settings into a valid config (older rows have none, or no loopGap). */
export function normalizeWaterfallConfig(input?: Partial<WaterfallConfig> | null): WaterfallConfig {
  return {
    enabled: input?.enabled === true,
    speed: clampFinite(input?.speed, WATERFALL_SPEED_MIN, WATERFALL_SPEED_MAX, DEFAULT_WATERFALL_CONFIG.speed),
    loopGap: clampFinite(input?.loopGap, 0, WATERFALL_LOOP_GAP_MAX, DEFAULT_WATERFALL_CONFIG.loopGap),
  };
}

/** Distance one loop covers, in grid heights: the grid itself plus the gap before it repeats. */
export function waterfallLoopPeriod(loopGap: number): number {
  return 1 + loopGap / 100;
}

/**
 * Advances the scroll offset (in grid heights, always in [0, loop period))
 * by `deltaSec` at `speed` percent of the grid height per second.
 */
export function advanceWaterfallProgress(progress: number, speed: number, deltaSec: number, loopGap = 0): number {
  const period = waterfallLoopPeriod(loopGap);
  const next = (progress + (speed / 100) * deltaSec) % period;
  return next < 0 ? next + period : next;
}

// ─── Full config ─────────────────────────────────────────────────────────────

export interface ExhibitionConfig {
  id: string;
  userId: string;
  name: string;
  layout: GridLayout;
  cells: ExhibitionCellConfig[];
  tunables: ExhibitionTunables;
  /** Size multiplier applied to every cell's model on top of its automatic fit-to-cell size (1 = default). */
  modelScale: number;
  waterfall: WaterfallConfig;
  /** Show the small connection-status dot in the corner of the show screen. */
  showConnectionIndicator: boolean;
  /** Colour behind the models and in the gaps between cells, `#rrggbb`. */
  backgroundColor: string;
  textureChangeBlink: TextureChangeBlinkConfig;
  /** Randomize each cycling cell's wait around its interval so objects change textures at different moments. */
  randomTextureTiming: boolean;
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
    /** Absent on rows saved before these display settings existed. */
    modelScale?: number;
    waterfall?: WaterfallConfig;
    showConnectionIndicator?: boolean;
    backgroundColor?: string;
    textureChangeBlink?: TextureChangeBlinkConfig;
    randomTextureTiming?: boolean;
  };
  access_token: string;
  created_at: string;
  updated_at: string;
}

export function generateExhibitionConfigId(): string {
  return `exhibition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
