-- Create viewers table
-- Stores viewer configurations with PIN authentication
CREATE TABLE IF NOT EXISTS viewers (
  id TEXT PRIMARY KEY, -- Generated viewer ID (e.g., "viewer_abc123")
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL, -- bcrypt hashed PIN (6 digits)
  settings JSONB NOT NULL DEFAULT '{
    "displayTitle": "",
    "displayMessage": "",
    "backgroundColor": "#000000",
    "textColor": "#ffffff",
    "rotationSpeed": 0.5,
    "modelDisplayDuration": 20
  }'::jsonb, -- Viewer display settings including rotation speed and model display time
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create viewer_models table
-- Stores 3D models associated with each viewer
CREATE TABLE IF NOT EXISTS viewer_models (
  id TEXT PRIMARY KEY, -- Generated model ID (e.g., "model_xyz789")
  viewer_id TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_file_url TEXT NOT NULL, -- URL to .glb/.obj file in Supabase Storage
  texture_template_url TEXT, -- URL to default texture template image
  qr_code_data TEXT NOT NULL, -- JSON encoded QR code data: {"viewerId": "...", "modelId": "..."}
  qr_code_image_url TEXT, -- URL to generated QR code image for download
  order_index INTEGER NOT NULL DEFAULT 0, -- Display order (for drag-to-reorder)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(viewer_id, order_index)
);

-- Create model_textures table
-- Stores uploaded and processed textures for each model
CREATE TABLE IF NOT EXISTS model_textures (
  id TEXT PRIMARY KEY, -- Generated texture ID (e.g., "texture_def456")
  model_id TEXT NOT NULL REFERENCES viewer_models(id) ON DELETE CASCADE,
  original_photo_url TEXT NOT NULL, -- URL to raw uploaded photo in user-texture-photos bucket
  corrected_texture_url TEXT NOT NULL, -- URL to perspective-corrected texture in processed-textures bucket
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_viewers_user_id ON viewers(user_id);
CREATE INDEX idx_viewer_models_viewer_id ON viewer_models(viewer_id);
CREATE INDEX idx_viewer_models_order ON viewer_models(viewer_id, order_index);
CREATE INDEX idx_model_textures_model_id ON model_textures(model_id);
CREATE INDEX idx_model_textures_uploaded_at ON model_textures(model_id, uploaded_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_viewers_updated_at
  BEFORE UPDATE ON viewers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_viewer_models_updated_at
  BEFORE UPDATE ON viewer_models
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_textures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for viewers table
-- Users can only see and manage their own viewers
CREATE POLICY "Users can view their own viewers"
  ON viewers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own viewers"
  ON viewers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own viewers"
  ON viewers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own viewers"
  ON viewers FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for viewer_models table
-- Users can manage models for their own viewers
CREATE POLICY "Users can view models for their viewers"
  ON viewer_models FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM viewers
      WHERE viewers.id = viewer_models.viewer_id
      AND viewers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert models for their viewers"
  ON viewer_models FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM viewers
      WHERE viewers.id = viewer_models.viewer_id
      AND viewers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update models for their viewers"
  ON viewer_models FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM viewers
      WHERE viewers.id = viewer_models.viewer_id
      AND viewers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete models for their viewers"
  ON viewer_models FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM viewers
      WHERE viewers.id = viewer_models.viewer_id
      AND viewers.user_id = auth.uid()
    )
  );

-- RLS Policies for model_textures table
-- Public can upload textures (INSERT), users can view textures for their models
CREATE POLICY "Anyone can upload textures"
  ON model_textures FOR INSERT
  WITH CHECK (true); -- Public upload via QR code scanning

CREATE POLICY "Users can view textures for their models"
  ON model_textures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM viewer_models
      JOIN viewers ON viewers.id = viewer_models.viewer_id
      WHERE viewer_models.id = model_textures.model_id
      AND viewers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete textures for their models"
  ON model_textures FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM viewer_models
      JOIN viewers ON viewers.id = viewer_models.viewer_id
      WHERE viewer_models.id = model_textures.model_id
      AND viewers.user_id = auth.uid()
    )
  );

-- Create a function to get the latest texture for each model
CREATE OR REPLACE FUNCTION get_latest_textures_for_viewer(p_viewer_id TEXT)
RETURNS TABLE (
  model_id TEXT,
  model_name TEXT,
  model_file_url TEXT,
  texture_url TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE,
  order_index INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (vm.id)
    vm.id as model_id,
    vm.name as model_name,
    vm.model_file_url,
    COALESCE(mt.corrected_texture_url, vm.texture_template_url) as texture_url,
    mt.uploaded_at,
    vm.order_index
  FROM viewer_models vm
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.id, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
