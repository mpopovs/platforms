# UV Map Template Feature

## Overview

Managers can now upload custom UV map images for each 3D model. The UV map shows users exactly how to color/paint the texture template.

## How It Works

### 1. Manager Uploads UV Map

In **Admin Panel → Viewer Management**:

1. Click the **"UV Map"** button on any model card
2. Upload an image showing the UV layout
3. The UV map is stored and linked to that specific model

### 2. Template Generation

When a user downloads the printable template:
- **Without UV map**: Shows generic "PAINT OR COLOR THIS AREA" message
- **With UV map**: Shows the UV map as background image in the coloring area

### 3. User Experience

```
┌─────────────────────────────────┐
│  Model Name                     │
│  Instructions...                │
│                                 │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │    [UV Map Image]         │  │  ← Shows exactly where to paint
│  │                           │  │
│  │              [QR Code]    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Database Changes

### Migration Required

Add `uv_map_url` column:

```sql
ALTER TABLE viewer_models
ADD COLUMN IF NOT EXISTS uv_map_url TEXT;
```

Location: `supabase/migrations/20250101000005_add_uv_map_url.sql`

## UI Changes

### Model Card - New Button

```
[ QR ] [ Template ] [ UV Map ]  ← New UV Map button
```

### UV Map Dialog

- **View current UV map** (if uploaded)
- **Upload new UV map** with file picker
- **Remove UV map** option
- Recommended dimensions: 1024x1024 or 2048x2048

## Code Changes

### 1. Type Definition

**File**: `lib/types/viewer.ts`

```typescript
export interface ViewerModelRow {
  // ... existing fields
  uv_map_url?: string | null;
}
```

### 2. Template Generation

**File**: `lib/qr-codes.ts`

```typescript
export function generateTextureTemplate(
  qrCodeDataUrl: string,
  modelName: string,
  viewerName: string,
  uvMapUrl?: string | null  // NEW parameter
): string
```

When `uvMapUrl` is provided:
- Sets UV map as background image in texture area
- Hides generic "PAINT OR COLOR" message
- UV map is positioned center, contained, no-repeat

### 3. Admin UI

**File**: `app/admin/viewers/viewers-management.tsx`

Added:
- UV Map button
- UV Map dialog with upload/view/remove
- State management for dialog and upload status

## Upload Implementation (TODO)

Current status: **UI ready, upload handler needs implementation**

To complete:
1. Create API endpoint: `/api/upload-uv-map`
2. Upload image to Supabase Storage
3. Update `viewer_models.uv_map_url`
4. Refresh model data in UI

## Recommended UV Map Guidelines

### Image Format
- **Format**: PNG (supports transparency) or JPG
- **Dimensions**: Square (1024x1024, 2048x2048, or 4096x4096)
- **File size**: Under 5MB for best performance

### Content
- Clear lines showing UV unwrap
- High contrast for visibility when printed
- Include reference markers if needed
- Avoid text that gets distorted in UV space

### Example Use Cases

1. **Simple cube**: Show 6 faces unfolded
2. **Character model**: Show front/back/sides laid out
3. **Complex model**: Export UV layout from Blender/Maya

## How to Get UV Map Image

### From 3D Software

**Blender**:
1. Open model
2. UV Editing workspace
3. UV → Export UV Layout
4. Save as PNG

**Maya**:
1. Select mesh
2. UV → UV Snapshot
3. Choose resolution
4. Export as PNG

**3ds Max**:
1. Unwrap UVW modifier
2. Tools → Render UVW Template
3. Save as image

### Manual Creation

1. Export UV layout from 3D software
2. Open in Photoshop/GIMP
3. Add colors, labels, instructions
4. Save as PNG/JPG

## Testing

### Test Without UV Map
1. Download template for model without UV map
2. Should show: "PAINT OR COLOR THIS AREA"

### Test With UV Map
1. Upload UV map via admin panel
2. Download template
3. Should show: UV map as background
4. Print and verify UV map is visible

## Benefits

✅ **Clear Instructions** - Users know exactly where to paint
✅ **Better Results** - Textures align correctly with 3D model
✅ **Reduced Errors** - No guessing about texture layout
✅ **Professional Look** - Templates look more polished
✅ **Model-Specific** - Each model can have custom UV layout

## Future Enhancements

- [ ] Auto-generate UV map from GLB file
- [ ] UV map editor in admin panel
- [ ] Multiple UV map layers
- [ ] Templates with color guides
- [ ] Grid overlay option
