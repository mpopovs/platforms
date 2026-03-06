// Viewer types and interfaces

// ─── Worksheet Builder Types ────────────────────────────────────────────────

export type WorksheetElementType = 'text' | 'image' | 'qr-zone' | 'texture-zone' | 'arrow';

export interface WorksheetTextStyle {
  fontSize: number;       // pt, default 10
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;          // hex, default '#000000'
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;
  padding?: number;       // px
}

export interface WorksheetElement {
  id: string;
  type: WorksheetElementType;
  /** Left edge as percentage of page width (0–100) */
  x: number;
  /** Top edge as percentage of page height (0–100) */
  y: number;
  /** Width as percentage of page width (0–100) */
  w: number;
  /** Height as percentage of page height (0–100) */
  h: number;
  /**
   * 'shared'    — same content on every model's worksheet (default for text/image).
   * 'per-model' — content/image can differ per model; texture-zone & qr-zone are always per-model.
   */
  scope?: 'shared' | 'per-model';
  /** Shared text content keyed by language code, e.g. { en: "...", lv: "..." } */
  content?: Record<string, string>;
  /** Per-model text content: { [modelId]: { [lang]: text } } — used when scope === 'per-model' */
  modelContent?: Record<string, Record<string, string>>;
  textStyle?: WorksheetTextStyle;
  /** Shared image URL for type === 'image' */
  imageUrl?: string;
  /** Per-model image URLs: { [modelId]: url } — used when scope === 'per-model' */
  modelImageUrl?: Record<string, string>;
  objectFit?: 'contain' | 'cover' | 'fill';
  /** Color for arrow elements (hex). Default '#333333'. */
  arrowColor?: string;
}

/** Lightweight text style for instruction page sections and extra blocks. */
export interface InstrTextStyle {
  fontSize?: number;           // pt
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
}

/** A single row in the instruction page body — items are laid out side-by-side as columns. */
export interface BodyRow {
  id: string;
  /** Ordered item IDs: 'klase'|'pin'|'observer'|'teacher-survey', or extra block IDs (position='body') */
  items: string[];
}

/** A single question in the teacher's custom survey. */
export type TeacherSurveyQuestion = {
  id: string;
  /** 'open' = short free-text answer; 'checkbox' = one or more options selectable; 'textarea' = long free-text area; 'likert' = 1-5 agreement scale */
  type: 'open' | 'checkbox' | 'textarea' | 'likert';
  /** Question text per language code */
  text: Record<string, string>;
  /** For checkbox questions: list of option texts per language */
  options?: Array<Record<string, string>>;
  required?: boolean;
};

/** Teacher-facing custom survey attached to an instruction page. */
export interface TeacherSurvey {
  enabled: boolean;
  /** Survey title per language, shown at the top of the fill-in page */
  title?: Record<string, string>;
  questions: TeacherSurveyQuestion[];
}

/** A free-form extra element added to the instruction page (below the main body). */
export interface InstrExtraBlock {
  id: string;
  type: 'text' | 'image' | 'url';
  /**
   * Where the block appears on the page:
   * 'body'         = inside the main body row alongside klase/pin/observer
   * 'after-header' = full-width row between header and body
   * 'after-body'   = below the body row, above the footer
   * 'after-footer' = below everything (default)
   */
  position?: 'body' | 'after-header' | 'after-body' | 'after-footer';
  /** Width as % of available container width; omit for auto flex sizing */
  widthPercent?: number;
  /** text block — content per language; supports {pin}, {klase_url}, {display_url} */
  content?: Record<string, string>;
  /** Text styling override for text blocks */
  textStyle?: InstrTextStyle;
  /** image block — data URL or absolute URL */
  imageUrl?: string;
  /** image max width in mm (default 80) */
  imageMaxWidthMm?: number;
  /** url block — the URL to display */
  url?: string;
  /** url block — optional label per language */
  urlLabel?: Record<string, string>;
  /** url block — show a QR code next to the URL */
  showQr?: boolean;
}

/** Visual style overrides for a single section on the instruction page. */
export interface KlaseInstructionSectionStyle {
  bg?: string;
  borderColor?: string;
  /** Style for the section heading (h2 / title text) */
  headingStyle?: InstrTextStyle;
  /** Style for body text (hints, sub-labels) */
  bodyStyle?: InstrTextStyle;
}

/** Per-language label overrides for the teacher instruction page. All fields are optional —
 *  leave undefined to fall back to the built-in default for that language. */
export interface KlaseInstructionPageLabels {
  title?: string;
  klaseSection?: string;
  klaseHint?: string;
  pinSection?: string;
  pinHint?: string;
  observerSection?: string;
  observerHint?: string;
}

/** Configuration for the teacher instruction page printed alongside /klase worksheets. */
export interface KlaseInstructionPage {
  enabled: boolean;
  /** Page orientation — default landscape */
  orientation?: 'landscape' | 'portrait';
  /** URL for the observer/novērotājs survey QR code */
  observerSurveyUrl?: string;
  /** Toggle individual sections */
  showHeader?: boolean;   // default true
  showKlase?: boolean;    // default true
  showPin?: boolean;      // default true
  showObserver?: boolean; // default true when observerSurveyUrl is set
  /** Show the /klase registration URL + QR inside the PIN section (default true) */
  showKlaseUrlInPin?: boolean;
  /** Size in mm of the viewer URL QR code shown inside the PIN section (default 16) */
  klaseUrlQrSizeMm?: number;
  /** Font size in pt of the viewer URL text shown inside the PIN section (default 6) */
  klaseUrlTextSizePt?: number;
  /** Order of the three body sections; default ['klase','pin','observer'] */
  sectionOrder?: ('klase' | 'pin' | 'observer')[];
  /**
   * Unified order of ALL items in the body zone — can contain 'klase'|'pin'|'observer'
   * and extra block IDs (position === 'body'). Replaces sectionOrder when present.
   */
  bodyItemOrder?: string[];
  /**
   * Body layout as rows. Each row renders as a horizontal strip of columns.
   * When present, replaces bodyItemOrder. Items use same id conventions.
   */
  bodyRows?: BodyRow[];
  /** Teacher-facing custom survey attached to this instruction page. */
  teacherSurvey?: TeacherSurvey;
  /** Optional extra instructions shown at the bottom, keyed by language code */
  customText?: Record<string, string>;
  /** Per-language overrides for every label on the page */
  translations?: Record<string, KlaseInstructionPageLabels>;
  /** Per-section style overrides */
  sectionStyles?: {
    header?: KlaseInstructionSectionStyle;
    klase?: KlaseInstructionSectionStyle;
    pin?: KlaseInstructionSectionStyle;
    observer?: KlaseInstructionSectionStyle;
    footer?: KlaseInstructionSectionStyle;
  };
  /** Extra free-form blocks appended below the main body */
  extraBlocks?: InstrExtraBlock[];
}

export interface WorksheetLayout {
  version: 1;
  elements: WorksheetElement[];
  /** The language code used as default/fallback when a translation is missing */
  defaultLang: string;
  /** All language codes present in this layout */
  languages: string[];
  pageBackground?: string;
  /** Printer safe-zone margin in mm (applied to all 4 sides). Default 8mm. */
  safeMarginMm?: number;
  /** Teacher instruction page for the /klase classroom flow */
  klaseInstructionPage?: KlaseInstructionPage;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ViewerConfig {
  id: string;
  userId: string;
  name: string;
  pin: string; // hashed PIN
  shortCode?: string; // Short code for simplified URLs (e.g., /v/abc123)
  logo_url?: string | null; // Logo to display in viewer
  parentViewerId?: string | null; // Set when this is a classroom child viewer
  createdAt: number;
  updatedAt: number;
  settings: ViewerSettings;
}

export interface ViewerSettings {
  displayTitle?: string;
  displayMessage?: string;
  backgroundColor?: string;
  textColor?: string;
  customContent?: string;
  rotationSpeed?: number; // Y-axis rotation speed for 3D models (default: 0.5)
  modelDisplayDuration?: number; // Seconds to display each model before switching (default: 20)
  showModelName?: boolean; // Show 3D model name in viewer overlay (default: true)
  displayModes?: DisplayModeSettings;
  textureCycling?: TextureCyclingSettings;
  // Lighting settings
  ambientLightIntensity?: number; // Ambient light intensity (default: 0.6)
  directionalLightIntensity?: number; // Directional light intensity (default: 0.8)
  // Logo settings
  showLogoInViewer?: boolean; // Show logo in viewer display (default: true). Logo always shown on certificates.
  // Widget settings
  widgetEnabled?: boolean; // Enable widget embedding (default: false)
  storageMode?: 'server' | 'local' | 'hybrid'; // Where to store processed textures (default: 'hybrid')
  enableArucoDetection?: boolean; // Enable smart ArUco mode: auto-detect model from markers, hide model selector (default: false, uses standard mode with manual selection)
  defaultModelId?: string; // Default model to show when no textures are uploaded (default: first model)
  surveyEnabled?: boolean; // Enable survey after texture upload
  surveyLanguage?: string; // Language for survey UI (en, lv, de, ru, lt, et) (default: 'en')
  certificateBottomImageUrl?: string; // Custom image URL to display below certificate (default: /pm-story.svg)
  research_purpose?: string; // English base text describing how survey data will be used in research
  research_purpose_translations?: Partial<Record<string, string>>; // Multilanguage research purpose (en, lv, de, ru, lt, et)
  classroomEnabled?: boolean; // Allow teachers to register classroom viewers via /klase (default: false)
  worksheetLayout?: WorksheetLayout; // Custom worksheet layout for all models in this viewer
}

export interface TextureCyclingSettings {
  priorityTimeWindow?: number;     // Hours to consider a texture "recent" (default: 2)
  priorityRepeatCount?: number;    // How many times to show priority textures before cycling all (default: 6)
  standardDisplayDuration?: number; // Seconds to display each texture in standard mode (default: 5)
  enabled?: boolean;               // Enable texture cycling mode (default: true)
}

export interface DisplayModeSettings {
  standardMode?: {
    duration: number;        // seconds per texture (default: 5)
    rotationSpeed: number;   // rad/sec (default: 0.5)
    enabled: boolean;
  };
  newUploadMode?: {
    duration: number;        // seconds for new textures (default: 8)
    highlightEffect: 'glow' | 'border' | 'pulse' | 'none';
    soundAlert: boolean;
    enabled: boolean;
  };
  showcaseMode?: {
    enabled: boolean;
    frequency: number;       // minutes between showcase modes (default: 18)
    duration: number;        // seconds showcase lasts (default: 60)
    textureInterval: number; // seconds per texture in showcase (default: 1.5)
  };
  detailedMode?: {
    duration: number;        // seconds for detailed view (default: 8)
    featuredModels: string[]; // array of model IDs to show longer
  };
  interactionSettings?: {
    pauseOnTouch: boolean;
    manualNavigation: boolean;
    autoResumeAfter: number; // seconds
  };
}

// Database types for Supabase
export interface ViewerRow {
  id: string;
  user_id: string;
  name: string;
  pin_hash: string;
  short_code?: string;
  logo_url?: string | null;
  parent_viewer_id?: string | null;
  settings: ViewerSettings;
  created_at: string;
  updated_at: string;
}

export interface ViewerModelRow {
  id: string;
  viewer_id: string;
  name: string;
  model_file_url: string;
  texture_template_url: string | null;
  qr_code_data: string;
  qr_code_image_url: string | null;
  order_index: number;
  short_code?: string;
  uv_map_url?: string | null;
  marker_id_base?: number; // Base ArUco marker ID for this model (uses markers base, base+1, base+2, base+3)
  created_at: string;
  updated_at: string;
}

export interface ModelTextureRow {
  id: string;
  model_id: string;
  original_photo_url: string;
  corrected_texture_url: string;
  uploaded_at: string;
  processed_at: string;
  author_name?: string;
  author_age?: number;
  queue_number?: number;
  upload_source_viewer_id?: string | null; // Which viewer's QR code was used to upload
}

// Extended model interface with latest texture
export interface ViewerModelWithTexture extends ViewerModelRow {
  latest_texture?: ModelTextureRow;
}

// Extended model interface with ALL textures
export interface ViewerModelWithAllTextures extends ViewerModelRow {
  textures: ModelTextureRow[];
}

// Model-texture pair for cycling display
export interface ModelTexturePair {
  model: ViewerModelRow;
  texture: ModelTextureRow | null; // null means use template/default
  isPriority: boolean; // true if recently uploaded
}

// QR Code data structure
export interface QRCodeData {
  viewerId: string;
  modelId: string;
}

export interface ViewerSession {
  viewerId: string;
  userId: string;
  ip: string;
  expiresAt: number;
  createdAt: number;
}

export interface ViewerAttempt {
  count: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

// Redis key builders
export const ViewerKeys = {
  config: (viewerId: string) => `viewer:${viewerId}:config`,
  userViewers: (userId: string) => `user:${userId}:viewers`,
  session: (token: string) => `viewer:session:${token}`,
  embedToken: (token: string) => `viewer:embed:${token}`,
  viewerEmbedTokens: (viewerId: string) => `viewer:${viewerId}:embed_tokens`,
  attempts: (viewerId: string, ip: string) => `viewer:${viewerId}:attempts:${ip}`,
  lock: (viewerId: string, ip: string) => `viewer:${viewerId}:lock:${ip}`,
} as const;

// Helper to generate viewer ID
export function generateViewerId(): string {
  return `viewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to generate model ID
export function generateModelId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to generate texture ID
export function generateTextureId(): string {
  return `texture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to generate 6-digit PIN
export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper to generate secure session token
export function generateSessionToken(): string {
  return `vst_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
}

// Helper to generate secure embed token (long-lived, for iframe URLs)
export function generateEmbedToken(): string {
  return `vembed_${Date.now()}_${Math.random().toString(36).substr(2, 24)}_${Math.random().toString(36).substr(2, 24)}`;
}
