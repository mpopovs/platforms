-- Add classroom viewer support
-- parent_viewer_id: links a classroom viewer to its parent museum viewer
ALTER TABLE viewers ADD COLUMN IF NOT EXISTS parent_viewer_id TEXT REFERENCES viewers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_viewers_parent_viewer_id ON viewers(parent_viewer_id);

-- upload_source_viewer_id: records which viewer's QR code was scanned when a texture was uploaded
ALTER TABLE model_textures ADD COLUMN IF NOT EXISTS upload_source_viewer_id TEXT REFERENCES viewers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_model_textures_upload_source_viewer_id ON model_textures(upload_source_viewer_id);
