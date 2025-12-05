# QR Code Requirement Removed

## Summary
QR code scanning has been **removed from the texture upload flow**. Users no longer need to include a QR code in their photo.

## Why the Change?

### Before (Redundant)
```
User scans QR code
  ↓
Opens /upload/viewerId/modelId
  ↓
Takes photo WITH QR code visible
  ↓
Server scans QR code again to get viewerId/modelId
```

**Problem**: The QR code was scanned twice - once to open the URL, and again from the photo. This was redundant!

### After (Simplified)
```
User scans QR code
  ↓
Opens /upload/viewerId/modelId
  ↓
Takes photo (only ArUco markers needed)
  ↓
viewerId/modelId already known from URL
```

## What Changed

### 1. Removed QR Code Scanning from Upload API
**File**: [app/api/upload-texture/route.ts](app/api/upload-texture/route.ts)

**Before**:
- Scanned QR code from photo
- Parsed viewerId/modelId from QR code
- Required QR code to be visible in every photo

**After**:
- Gets viewerId/modelId from form data
- No image scanning needed
- Faster processing

### 2. Updated Upload Form
**File**: [app/upload/[viewerId]/[modelId]/upload-form.tsx](app/upload/[viewerId]/[modelId]/upload-form.tsx)

Now sends viewerId/modelId with the photo:
```typescript
formData.append('viewerId', viewerId);
formData.append('modelId', modelId);
formData.append('photo', processedFile);
```

### 3. Updated Instructions
**File**: [app/upload/[viewerId]/[modelId]/page.tsx](app/upload/[viewerId]/[modelId]/page.tsx)

**Old instructions**:
- Take a photo of your colored texture
- **Make sure the QR code is visible in the photo** ❌
- Upload the photo below

**New instructions**:
- Take a photo of your colored texture with ArUco markers visible
- Make sure all 4 ArUco markers (corner markers) are clearly visible
- Upload the photo below
- Your texture will be automatically cropped and applied!

## What's Required Now

### Template Requirements
✅ **4 ArUco Markers** (IDs 0-3, DICT_6X6_250) - For texture cropping
❌ **QR Code** - No longer needed in the photo!

### User Flow
1. User scans QR code → opens upload page with specific viewerId/modelId
2. User takes photo with **only ArUco markers visible**
3. Client-side ArUco detection crops texture
4. Upload with viewerId/modelId from URL
5. Done!

## Benefits

✅ **Simpler Templates** - Only need ArUco markers in corners
✅ **Easier for Users** - Don't need to keep QR code in frame
✅ **Faster Processing** - No QR code scanning needed
✅ **Cleaner Textures** - QR code doesn't interfere with texture area
✅ **More Reliable** - One less thing that can fail

## QR Code Still Used For...

The QR code is still important! It's used to:
- Generate the unique upload URL
- Direct users to the correct model
- Track which viewer/model combination

**But it's no longer needed IN THE PHOTO!**

## Migration Notes

If you have existing templates with QR codes:
- They still work fine
- QR code can be anywhere (or removed from template)
- Only ArUco markers matter for texture cropping
- Consider updating templates to remove QR code area and maximize texture space

## Example Template

### Old Template
```
┌─────────────────────────┐
│ [0]              [1]    │  ← ArUco markers
│                         │
│        [QR CODE]        │  ← QR code (no longer needed!)
│                         │
│ [3]              [2]    │
└─────────────────────────┘
```

### New Template (Recommended)
```
┌─────────────────────────┐
│ [0]              [1]    │  ← ArUco markers
│                         │
│     TEXTURE AREA        │  ← More space for texture!
│                         │
│ [3]              [2]    │
└─────────────────────────┘
```

QR code can be:
- On a separate label
- On the back of the template
- On packaging
- Just used to generate the upload URL

## Code Changes Summary

**Removed**:
- ❌ jsQR library import
- ❌ sharp image processing for QR scanning
- ❌ parseQRCodeData function
- ❌ QR code detection logic (~100 lines)
- ❌ GET handler for testing form

**Added**:
- ✅ viewerId/modelId from form data
- ✅ Simpler validation
- ✅ Updated user instructions

**Files Modified**:
- [app/api/upload-texture/route.ts](app/api/upload-texture/route.ts) - Removed QR scanning
- [app/upload/[viewerId]/[modelId]/upload-form.tsx](app/upload/[viewerId]/[modelId]/upload-form.tsx) - Send IDs with form
- [app/upload/[viewerId]/[modelId]/page.tsx](app/upload/[viewerId]/[modelId]/page.tsx) - Updated instructions
