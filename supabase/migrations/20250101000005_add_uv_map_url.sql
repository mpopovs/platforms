-- Add uv_map_url column to viewer_models for custom UV map templates
ALTER TABLE viewer_models
ADD COLUMN IF NOT EXISTS uv_map_url TEXT;

-- Add comment
COMMENT ON COLUMN viewer_models.uv_map_url IS 'URL to custom UV map image that shows how to color the texture template';
