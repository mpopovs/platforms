// Viewer types and interfaces

export interface ViewerConfig {
  id: string;
  userId: string;
  name: string;
  pin: string; // hashed PIN
  shortCode?: string; // Short code for simplified URLs (e.g., /v/abc123)
  logo_url?: string | null; // Logo to display in viewer
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
  // Widget settings
  widgetEnabled?: boolean; // Enable widget embedding (default: false)
  storageMode?: 'server' | 'local' | 'hybrid'; // Where to store processed textures (default: 'hybrid')
  enableArucoDetection?: boolean; // Enable smart ArUco mode: auto-detect model from markers, hide model selector (default: false, uses standard mode with manual selection)
  defaultModelId?: string; // Default model to show when no textures are uploaded (default: first model)
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
