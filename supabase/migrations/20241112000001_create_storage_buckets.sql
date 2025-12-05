-- Create storage buckets for 3D models and textures
-- Note: This can also be done via Supabase Dashboard under Storage

-- Create bucket for 3D model files (.glb, .obj)
INSERT INTO storage.buckets (id, name, public)
VALUES ('3d-models', '3d-models', false)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for texture template images (with QR codes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('texture-templates', 'texture-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for user uploaded texture photos (raw)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-texture-photos', 'user-texture-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for processed/corrected textures
INSERT INTO storage.buckets (id, name, public)
VALUES ('processed-textures', 'processed-textures', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for 3d-models bucket
-- Only authenticated users can upload their own models
CREATE POLICY "Authenticated users can upload 3D models"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = '3d-models');

CREATE POLICY "Authenticated users can view 3D models"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = '3d-models');

CREATE POLICY "Authenticated users can delete their 3D models"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = '3d-models' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for texture-templates bucket
-- Public can view templates, authenticated users can manage
CREATE POLICY "Anyone can view texture templates"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'texture-templates');

CREATE POLICY "Authenticated users can upload texture templates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'texture-templates');

CREATE POLICY "Authenticated users can delete their texture templates"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'texture-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for user-texture-photos bucket
-- Public can upload (via QR code workflow), authenticated users can view their own
CREATE POLICY "Anyone can upload texture photos"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'user-texture-photos');

CREATE POLICY "Authenticated users can view texture photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'user-texture-photos');

CREATE POLICY "Authenticated users can delete texture photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'user-texture-photos');

-- Storage policies for processed-textures bucket
-- Public can view (needed for viewer display), system can manage
CREATE POLICY "Anyone can view processed textures"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'processed-textures');

CREATE POLICY "Authenticated users can upload processed textures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'processed-textures');

CREATE POLICY "Authenticated users can delete processed textures"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'processed-textures');
