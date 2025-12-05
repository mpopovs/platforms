# ArUco Marker Texture Cropping - Complete Flow

## Overview

Textures are now **cropped client-side** using **ArUco markers** before upload. The server only stores the already-cropped texture.

## Complete Upload Flow

### 1. User Selects Image
- User opens upload form at `/upload/[viewerId]/[modelId]`
- OpenCV.js loads automatically in background

### 2. Client-Side Processing (Automatic)
```typescript
// app/upload/[viewerId]/[modelId]/upload-form.tsx
const processed = await processImage(selectedFile, {
  targetSize: 2048,
  enableQRDetection: true // Detects ArUco markers
});
```

**What happens:**
- Detects ArUco markers (IDs 0-3) using OpenCV.js
- Extracts corner positions from markers
- Applies perspective correction
- Crops to 2048x2048 texture
- Applies white balance and enhancement
- Shows preview to user

### 3. User Uploads Cropped Texture
```typescript
// Convert processed canvas to file
const blob = await fetch(processedPreview).then(r => r.blob());
const processedFile = new File([blob], 'cropped_texture.png', { type: 'image/png' });

formData.append('photo', processedFile);
formData.append('clientProcessed', 'true'); // Important flag!
```

### 4. Server Receives Upload
```typescript
// app/api/upload-texture/route.ts
const clientProcessed = formData.get('clientProcessed') === 'true';

if (clientProcessed) {
  // Upload as final processed texture directly
  const processedTextureUrl = await uploadUserTexturePhoto(
    viewerId,
    modelId,
    `${textureId}_processed`,
    file
  );

  // Save to database immediately (no further processing)
  await createModelTexture(textureId, modelId, photoUrl, processedTextureUrl);
}
```

### 5. QR Code Identification (Server)
- QR code still scanned server-side for `viewerId`/`modelId`
- Used to validate which model this texture belongs to
- ArUco markers are for cropping, QR is for identification

## Key Changes

### ✅ Client-Side (Browser)
- **File**: [upload-form.tsx](app/upload/[viewerId]/[modelId]/upload-form.tsx)
- Processes image immediately on file selection
- Shows processed preview with before/after
- Uploads cropped texture with `clientProcessed=true` flag

### ✅ Server-Side (API)
- **File**: [upload-texture/route.ts](app/api/upload-texture/route.ts)
- Checks `clientProcessed` flag
- If true: stores texture directly (already cropped)
- If false: triggers server-side fallback processing

### ✅ Image Processor
- **File**: [imageProcessor.ts](components/utils/imageProcessor.ts)
- Detects ArUco markers (IDs 0-3)
- Performs perspective correction
- Applies enhancement filters
- Returns cropped 2048x2048 canvas

## Two Processing Paths

### Path A: ArUco Markers Detected (Preferred)
```
User selects image
  ↓
ArUco markers detected (IDs 0-3)
  ↓
Client crops texture → 2048x2048
  ↓
User sees preview
  ↓
Upload cropped texture (clientProcessed=true)
  ↓
Server stores directly (no processing)
  ↓
✅ Done
```

### Path B: No ArUco Markers (Fallback)
```
User selects image
  ↓
No ArUco markers detected
  ↓
Error message shown
  ↓
User can still upload original
  ↓
Upload original (clientProcessed=false)
  ↓
Server applies simple correction
  ↓
✅ Done (lower quality)
```

## Template Requirements

Your texture templates must have:

1. **4 ArUco Markers** (for cropping):
   - Marker ID 0 → Top-left corner
   - Marker ID 1 → Top-right corner
   - Marker ID 2 → Bottom-right corner
   - Marker ID 3 → Bottom-left corner
   - Dictionary: DICT_6X6_250

2. **1 QR Code** (for identification):
   - Contains: `{"viewerId": "xxx", "modelId": "yyy"}`
   - Or URL: `https://domain.com/upload/viewerId/modelId`
   - Can be anywhere (typically center)

## Testing

### Generate ArUco Markers
```python
import cv2
import cv2.aruco as aruco

dict = aruco.getPredefinedDictionary(aruco.DICT_6X6_250)
for i in range(4):
    img = aruco.generateImageMarker(dict, i, 200)
    cv2.imwrite(f'marker_{i}.png', img)
```

### Test Flow
1. Create template with 4 markers + QR code
2. Take photo of template
3. Upload via form
4. Check console logs for:
   - ✅ "ArUco markers detected"
   - ✅ "Uploading ArUco-cropped texture"
   - ✅ "Texture uploaded and processed with ArUco markers successfully"

## Troubleshooting

### "No ArUco markers detected"
- Ensure all 4 markers visible (IDs 0, 1, 2, 3)
- Markers must use DICT_6X6_250 dictionary
- Lighting should be adequate
- Photo should be reasonably focused

### "No QR code found"
- QR code must be in the uploaded image
- QR code separate from ArUco markers
- Used only for model identification

### OpenCV.js not loading
- Check `/public/opencv/opencv.js` exists
- Check browser console for load errors
- Form will still work but no client processing

## Benefits of This Approach

✅ **Instant Feedback** - User sees cropped texture immediately
✅ **Reduced Server Load** - No server-side image processing needed
✅ **Better UX** - User can verify crop before uploading
✅ **Accurate Cropping** - ArUco markers more precise than edge detection
✅ **Offline Processing** - Works without server round-trip
✅ **Bandwidth Savings** - Upload only the cropped texture
