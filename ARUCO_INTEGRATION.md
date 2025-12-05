# ArUco Marker Integration for Texture Processing

## Overview

The platform now uses **ArUco markers** for automatic texture cropping and perspective correction. Images are processed **client-side** using OpenCV.js, while QR codes are still used server-side for viewer/model identification.

## Architecture

### Client-Side Processing (Browser)
- **File**: `components/utils/imageProcessor.ts`
- **Library**: OpenCV.js (from `/public/opencv/opencv.js`)
- **Process**:
  1. User uploads an image with ArUco markers (IDs 0-3)
  2. Image is processed client-side to detect ArUco markers
  3. Perspective correction is applied based on marker positions
  4. Processed texture is cropped to 2048x2048
  5. White balance and enhancement filters are applied
  6. Processed image is uploaded to server

### Server-Side Processing
- **File**: `app/api/upload-texture/route.ts`
- **Purpose**: QR code scanning for viewer/model identification
- **Process**:
  1. Receives uploaded image (processed or original)
  2. Scans for QR code to extract `viewerId` and `modelId`
  3. Validates model exists and belongs to viewer
  4. Stores image and triggers background processing

## Marker Configuration

### ArUco Markers
- **Dictionary**: `DICT_6X6_250`
- **Required Marker IDs**:
  - `0` → Top-left corner
  - `1` → Top-right corner
  - `2` → Bottom-right corner
  - `3` → Bottom-left corner

### Marker Corner Mapping
Each ArUco marker has 4 corners (indices 0-3):
- `0`: top-left of marker
- `1`: top-right of marker
- `2`: bottom-right of marker
- `3`: bottom-left of marker

The texture area is defined by taking the specific corner of each marker:
- Marker 0 corner 0 → texture top-left
- Marker 1 corner 1 → texture top-right
- Marker 2 corner 2 → texture bottom-right
- Marker 3 corner 3 → texture bottom-left

## Processing Pipeline

### 1. Image Upload (Client)
```typescript
// components/upload-form.tsx
const processed = await processImage(file, {
  targetSize: 2048,
  enableQRDetection: true
});
```

### 2. ArUco Detection
```typescript
// components/utils/imageProcessor.ts
const markers = await detectArucoMarkers(canvas);
// Detects markers with IDs 0-3
```

### 3. Perspective Correction
```typescript
const processedCanvas = await correctPerspective(canvas, markers, 2048);
// Crops and warps texture to square
```

### 4. Enhancement
- White balance using background sampling
- Brightness: 0.95
- Contrast: 1.1
- Saturation: 1.05
- Sharpness: 1.3

### 5. Upload
```typescript
// Convert processed canvas to file
const processedFile = new File([blob], file.name, { type: 'image/png' });
formData.append('photo', processedFile);
formData.append('clientProcessed', 'true');
```

## Files Modified

1. **`app/api/upload-texture/route.ts`**
   - Added comment clarifying ArUco is for cropping, QR for identification
   - QR code scanning unchanged

2. **`app/api/process-texture/route.ts`**
   - Removed server-side perspective correction
   - Added check for `clientProcessed` flag
   - Falls back to simple correction if not processed client-side

3. **`app/upload/[viewerId]/[modelId]/upload-form.tsx`**
   - Added OpenCV.js loading on mount
   - Processes images immediately on file selection
   - Shows original and processed previews
   - Uploads processed image with `clientProcessed` flag

## Workflow

### User Flow
1. User opens upload form
2. OpenCV.js loads in background
3. User selects/captures photo with ArUco markers + QR code
4. Image is processed automatically:
   - ✅ ArUco markers detected → cropped texture preview shown
   - ❌ No markers → error message, original can still be uploaded
5. User clicks "Upload Texture"
6. Processed texture uploaded with QR code for identification

### Server Flow
1. Receives image (processed or original)
2. Scans QR code for `viewerId` and `modelId`
3. Validates model exists
4. Stores image in storage
5. Creates texture record in database
6. Returns success response

## Benefits

### Client-Side Processing
- ✅ Instant visual feedback
- ✅ Reduces server load
- ✅ Faster processing (no round-trip)
- ✅ User can verify crop before upload

### ArUco vs QR
- ✅ More accurate corner detection
- ✅ Better perspective correction
- ✅ 4 markers = 4 precise corners
- ✅ Works with printed templates
- ✅ OpenCV native support

### Hybrid Approach
- ✅ ArUco for texture cropping (client)
- ✅ QR for model identification (server)
- ✅ Best of both worlds

## Template Requirements

Templates should include:
1. **4 ArUco markers** (IDs 0-3) at corners for texture cropping
2. **1 QR code** anywhere (typically center) for model identification

Example template structure:
```
┌─────────────────────────┐
│ [0]              [1]    │  ← ArUco markers at corners
│                         │
│        [QR CODE]        │  ← QR code for identification
│                         │
│ [3]              [2]    │  ← ArUco markers at corners
└─────────────────────────┘
```

## Error Handling

### No ArUco Markers Detected
- Shows error: "Could not detect ArUco markers. Please ensure all 4 markers (IDs 0-3) are visible."
- User can still upload original image
- Server applies simple correction as fallback

### No QR Code Detected
- Server returns error: "No QR code found in image"
- Upload fails (QR code required for model identification)

### OpenCV.js Load Failure
- Form still works, but no client-side processing
- Original image uploaded
- Server applies fallback processing

## Testing

To test the integration:

1. **Generate test image** with ArUco markers:
   ```bash
   # Use OpenCV Python to generate markers
   python -c "import cv2; aruco = cv2.aruco; dict = aruco.getPredefinedDictionary(aruco.DICT_6X6_250); for i in range(4): cv2.imwrite(f'marker_{i}.png', aruco.generateImageMarker(dict, i, 200))"
   ```

2. **Create template** with markers at corners + QR code in center

3. **Upload test image** and verify:
   - ArUco markers detected
   - Texture cropped correctly
   - QR code scanned successfully
   - Processed texture stored

## Future Improvements

- [ ] Add debug visualization mode (show detected markers)
- [ ] Support fallback to boundary detection if markers not found
- [ ] Add marker quality checks (perspective, occlusion)
- [ ] Support custom marker dictionaries
- [ ] Add processing progress indicator
- [ ] Cache OpenCV.js for faster subsequent loads
