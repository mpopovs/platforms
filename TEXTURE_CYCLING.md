# Texture Cycling Feature

## Overview

The texture cycling feature allows viewers to display **all textures** from **all 3D models** in a rotating cycle, rather than just showing the latest texture per model. This is ideal for displaying multiple user-submitted textures across different 3D objects.

## How It Works

### Priority System

1. **Recent Uploads Get Priority**: Textures uploaded within the last N hours (default: 2 hours) are shown multiple times (default: 6 times) before the full cycle begins
2. **Full Cycle**: After showing priority textures, the display cycles through ALL textures from ALL models
3. **Configurable Settings**: All timing and priority settings can be adjusted per viewer

### Display Queue Example

If you have:
- Model A with textures: A1 (uploaded 1 hour ago), A2 (uploaded 3 hours ago), A3 (uploaded 5 hours ago)
- Model B with textures: B1 (uploaded 30 mins ago), B2 (uploaded 4 hours ago)

With default settings (2-hour window, 6x repeat):

**Display order:**
1. Priority textures (6 times): B1, A1, B1, A1, B1, A1, B1, A1, B1, A1, B1, A1
2. Then full cycle: B1, A1, A2, A3, B2 (repeats)

## Configuration

### In Viewer Management UI

1. Go to **Admin > Viewers**
2. Find your viewer card
3. Click **"Texture Cycling"** button
4. Configure:
   - **Enable texture cycling mode**: Turn the feature on/off
   - **Priority Time Window**: How many hours back to consider textures "recent" (default: 2)
   - **Priority Repeat Count**: How many times to show recent textures (default: 6)
   - **Display Duration**: Seconds to show each texture (default: 5)

### Settings Object

```typescript
{
  textureCycling: {
    enabled: true,              // Enable/disable feature
    priorityTimeWindow: 2,      // Hours
    priorityRepeatCount: 6,     // Number of repeats
    standardDisplayDuration: 5  // Seconds per texture
  }
}
```

## Database Changes

### New Migration

Run the migration in `supabase/migrations/20251126000001_add_get_all_textures_function.sql`:

```sql
CREATE OR REPLACE FUNCTION get_all_textures_for_viewer(p_viewer_id TEXT)
RETURNS TABLE (...)
```

This function returns all models with ALL their textures (not just the latest).

### New API Endpoint

- **GET** `/api/viewer-models-all-textures/[viewerId]`
  - Returns all models with all their textures
  - Used by ModelCarousel when texture cycling is enabled

## Code Changes

### 1. Type Definitions (`lib/types/viewer.ts`)

Added:
```typescript
export interface TextureCyclingSettings {
  priorityTimeWindow?: number;
  priorityRepeatCount?: number;
  standardDisplayDuration?: number;
  enabled?: boolean;
}

export interface ViewerModelWithAllTextures extends ViewerModelRow {
  textures: ModelTextureRow[];
}

export interface ModelTexturePair {
  model: ViewerModelRow;
  texture: ModelTextureRow | null;
  isPriority: boolean;
}
```

### 2. Backend (`lib/viewers.ts`)

Added:
```typescript
export async function getViewerModelsWithAllTextures(viewerId: string): Promise<ViewerModelWithAllTextures[]>
```

### 3. ModelCarousel Component (`components/model-carousel.tsx`)

- Added `textureCycling` and `viewerId` props
- Fetches all textures when texture cycling is enabled
- Builds display queue with priority textures repeated N times
- Cycles through model-texture pairs instead of just models

### 4. ViewerDisplay (`app/viewer/[viewerId]/viewer-display.tsx`)

- Passes `textureCycling` settings and `viewerId` to ModelCarousel

### 5. UI Components

- **TextureCyclingSettingsDialog**: New dialog for configuring texture cycling settings
- **API Route**: `/api/update-viewer-settings` for saving settings

## Usage

### Enable Texture Cycling

1. Upload multiple 3D models to your viewer
2. Upload multiple textures to each model (via QR code or upload page)
3. Go to viewer management and click "Texture Cycling"
4. Enable the feature and adjust settings
5. Open the viewer - it will now cycle through all textures

### Disable Texture Cycling

1. Go to viewer management
2. Click "Texture Cycling"
3. Uncheck "Enable texture cycling mode"
4. The viewer will revert to showing only the latest texture per model

## Benefits

- **Showcase all user submissions**: Every uploaded texture gets displayed
- **Recent uploads highlighted**: New textures are shown more frequently
- **Flexible configuration**: Adjust timing and priority per viewer
- **Backward compatible**: Existing viewers work unchanged if texture cycling is disabled

## Technical Notes

- The feature uses IndexedDB caching for all textures (via Service Worker)
- Textures are loaded on-demand as they enter the display queue
- The display queue is rebuilt when new textures are detected
- All timing settings are in seconds/hours for consistency
