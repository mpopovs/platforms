-- Add short_code column to viewer_models for short upload URLs
ALTER TABLE viewer_models
ADD COLUMN short_code TEXT UNIQUE;

-- Create index for fast short code lookups
CREATE INDEX IF NOT EXISTS idx_viewer_models_short_code ON viewer_models(short_code);

-- Add comment
COMMENT ON COLUMN viewer_models.short_code IS 'Short code for simplified upload URLs (e.g., /u/abc123)';
