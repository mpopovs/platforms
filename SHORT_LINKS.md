# Short Links & Simplified QR Codes

## Overview

QR codes now use **short links** (`/u/abc123`) instead of long URLs, making them **visually simpler** and easier to scan.

## What Changed

### 1. Short Link System
**Before**: `https://yourdomain.com/upload/viewer_1763120055354_hlpy8afwx/model_1764017468914_wrv3hg65l`
**After**: `https://yourdomain.com/u/abc123`

### 2. Simpler QR Codes
- Changed error correction from **High (H)** to **Low (L)**
- Shorter URLs = Less dense QR code patterns
- Easier to scan, cleaner appearance

## How It Works

### Short Code Generation
```typescript
// lib/short-links.ts
import { customAlphabet } from 'nanoid';

// 4-character codes using URL-safe alphabet (no confusing 0, O, I, l)
const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 8);

const shortCode = nanoid(); // e.g., "K7mN"
const shortUrl = `/u/${shortCode}`;
```

### Redirect Flow
```
User scans QR code → /u/K7mN
  ↓
Server looks up short_code in database
  ↓
Redirects to /upload/viewerId/modelId
  ↓
User uploads texture
```

## Database Changes

### Migration
```sql
-- Add short_code column
ALTER TABLE viewer_models
ADD COLUMN short_code TEXT UNIQUE;

-- Index for fast lookups
CREATE INDEX idx_viewer_models_short_code ON viewer_models(short_code);
```

Run migration:
```bash
# Apply to your Supabase database
```

## Files Changed

### 1. Short Link Library
**File**: [lib/short-links.ts](lib/short-links.ts)
- Generate 4-character URL-safe short codes
- Create short upload URLs
- Parse upload URLs

### 2. Redirect Route
**File**: [app/u/[shortCode]/route.ts](app/u/[shortCode]/route.ts)
- Handles `/u/abc123` requests
- Looks up model by short_code
- Redirects to full upload URL

### 3. QR Code Generation
**File**: [lib/qr-codes.ts](lib/qr-codes.ts)
- Changed error correction: `'H'` → `'L'`
- Results in simpler, less dense QR codes

### 4. Model Creation
**File**: [app/actions.ts](app/actions.ts)
- Generate short code for each model
- Store in database
- Use short URL for QR code

### 5. Database Function
**File**: [lib/viewers.ts](lib/viewers.ts)
- Updated `createViewerModel()` to accept `shortCode`

## Benefits

### ✅ Simpler QR Codes
- **Less dense patterns** - easier to scan
- **Smaller file size** - faster loading
- **Better print quality** - cleaner appearance

### ✅ Shorter URLs
- **Easier to share** - can type manually if needed
- **Better UX** - looks cleaner in browsers
- **Less error-prone** - fewer characters to mess up

### ✅ Maintains Security
- **8 characters** = 10.5 million combinations
- **URL-safe alphabet** (excluding confusing characters)
- **Unique constraint** in database

## Examples

### QR Code Comparison

**Old (Long URL)**:
- URL: `https://domain.com/upload/viewer_1763120055354_hlpy8afwx/model_1764017468914_wrv3hg65l`
- QR Code: Very dense, many small squares
- Error Correction: High (30% can be damaged)

**New (Short URL)**:
- URL: `https://domain.com/u/K7mN`
- QR Code: Simpler pattern, larger squares
- Error Correction: Low (7% can be damaged, but easier to scan)

### Short Code Format
```
Characters: 8
Alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz (57 chars)
No confusing characters: 0 (zero), O (letter), I (letter), l (lowercase L)
Combinations: 57^4 = 10,556,001 (10.5 million)
```

### Example Short Codes
- `K7mN`
- `Xy3A`
- `9Pqr`
- `Def2`

## Usage

### In Admin Panel
When you create a model:
```typescript
const shortCode = generateShortCode(); // "K7mN"
const qrCodeUrl = createShortUploadUrl(baseUrl, shortCode); // "https://domain.com/u/K7mN"

// Store model with short_code
await createViewerModel(..., shortCode);
```

### User Scans QR Code
1. Scans QR code → opens `/u/K7mN`
2. Server redirects to `/upload/viewerId/modelId`
3. User sees upload form
4. Uploads texture

### Display Short Link
You can show the short link to users:
```tsx
<div>
  <p>Share this link:</p>
  <code>https://yourdomain.com/u/{model.short_code}</code>
</div>
```

## Error Handling

### Short Code Not Found
```typescript
// Returns 404 if short_code doesn't exist
GET /u/invalid123
→ { error: 'Invalid or expired link' }
```

### Collision Prevention
- Unique constraint in database
- If duplicate generated (extremely rare), will fail and retry
- 10.5 million combinations makes collisions virtually impossible

## Migration for Existing Models

If you have existing models without short codes:

```typescript
// Generate short codes for existing models
const models = await getAllModels();
for (const model of models) {
  if (!model.short_code) {
    const shortCode = generateShortCode();
    await updateModel(model.id, { short_code: shortCode });

    // Update QR code URL
    const newQrUrl = createShortUploadUrl(baseUrl, shortCode);
    await updateModel(model.id, { qr_code_data: newQrUrl });
  }
}
```

## Testing

### Test Short Link
```bash
# Create a model (generates short code automatically)
# Then test the redirect:
curl -I http://localhost:3000/u/K7mN

# Should return:
HTTP/1.1 307 Temporary Redirect
Location: /upload/viewerId/modelId
```

### Test QR Code
1. Generate QR code for short URL
2. Scan with phone
3. Should redirect to upload page
4. QR code should be noticeably simpler/cleaner

## Future Enhancements

- [ ] Custom short codes (user-defined)
- [ ] Analytics on short link clicks
- [ ] Expiration dates for short links
- [ ] QR code customization (colors, logo)
- [ ] Bulk short link generation
