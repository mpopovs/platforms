-- Add short_code column to viewers for short viewer access URLs
ALTER TABLE viewers
ADD COLUMN short_code TEXT UNIQUE;

-- Create index for fast short code lookups
CREATE INDEX IF NOT EXISTS idx_viewers_short_code ON viewers(short_code);

-- Add comment
COMMENT ON COLUMN viewers.short_code IS 'Short code for simplified viewer URLs (e.g., /v/abc123)';
