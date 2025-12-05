# Apply Short Code Migrations

You need to run **2 SQL migrations** to fix the short codes display issue.

## Quick Fix (Copy/Paste Both)

Go to **Supabase Dashboard → SQL Editor** and run these in order:

### 1. Add short_code Column

```sql
-- Add short_code column to viewer_models for short upload URLs
ALTER TABLE viewer_models
ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- Create index for fast short code lookups
CREATE INDEX IF NOT EXISTS idx_viewer_models_short_code ON viewer_models(short_code);

-- Add comment
COMMENT ON COLUMN viewer_models.short_code IS 'Short code for simplified upload URLs (e.g., /u/abc123)';
```

### 2. Update Database Function

```sql
-- Update get_latest_textures_for_viewer to include short_code
DROP FUNCTION IF EXISTS get_latest_textures_for_viewer(text);

CREATE FUNCTION get_latest_textures_for_viewer(p_viewer_id TEXT)
RETURNS TABLE (
  id TEXT,
  viewer_id TEXT,
  name TEXT,
  model_file_url TEXT,
  texture_template_url TEXT,
  qr_code_data TEXT,
  qr_code_image_url TEXT,
  order_index INTEGER,
  short_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  latest_texture_id TEXT,
  latest_texture_original_photo_url TEXT,
  latest_texture_corrected_texture_url TEXT,
  latest_texture_uploaded_at TIMESTAMP WITH TIME ZONE,
  latest_texture_processed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (vm.id)
    vm.id,
    vm.viewer_id,
    vm.name,
    vm.model_file_url,
    vm.texture_template_url,
    vm.qr_code_data,
    vm.qr_code_image_url,
    vm.order_index,
    vm.short_code,
    vm.created_at,
    vm.updated_at,
    mt.id as latest_texture_id,
    mt.original_photo_url as latest_texture_original_photo_url,
    mt.corrected_texture_url as latest_texture_corrected_texture_url,
    mt.uploaded_at as latest_texture_uploaded_at,
    mt.processed_at as latest_texture_processed_at
  FROM viewer_models vm
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.id, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Then Generate Short Codes

After running both migrations, generate short codes for existing models:

```bash
pnpm run generate-short-codes
```

## Verify

1. Refresh `/admin/viewers`
2. You should see short links like: `🔗 yourdomain.com/u/K7mN`

## Why This Was Needed

1. **First migration**: Adds the `short_code` column to the database table
2. **Second migration**: Updates the database function to return `short_code` when fetching models
3. **Code fix**: Already done - `lib/viewers.ts` now includes `short_code` in the mapping

Without the second migration, the database function doesn't return `short_code`, so even though it exists in the database, it won't show up in the UI!
