-- Make 3d-models bucket publicly readable
-- This allows the upload preview to load models without authentication

-- Update bucket to be public
UPDATE storage.buckets
SET public = true
WHERE id = '3d-models';

-- Add public SELECT policy for 3d-models
-- Drop existing authenticated-only policy if it exists
DROP POLICY IF EXISTS "Authenticated users can view 3D models" ON storage.objects;

-- Create new public SELECT policy
CREATE POLICY "Anyone can view 3D models"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = '3d-models');

-- Keep the existing INSERT and DELETE policies for authenticated users
-- (Already exist in 20241112000001_create_storage_buckets.sql)

-- Fix all existing model URLs to use correct db.claypixels.eu domain
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'https://claypixels.eu/storage/%';

-- Also fix any http URLs
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'http://claypixels.eu/storage/%';

-- Fix texture template URLs
UPDATE viewer_models
SET texture_template_url = REPLACE(texture_template_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE texture_template_url LIKE 'https://claypixels.eu/storage/%';

UPDATE viewer_models
SET texture_template_url = REPLACE(texture_template_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE texture_template_url LIKE 'http://claypixels.eu/storage/%';

-- Fix UV map URLs
UPDATE viewer_models
SET uv_map_url = REPLACE(uv_map_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE uv_map_url LIKE 'https://claypixels.eu/storage/%';

UPDATE viewer_models
SET uv_map_url = REPLACE(uv_map_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE uv_map_url LIKE 'http://claypixels.eu/storage/%';

-- Fix texture URLs in model_textures table
UPDATE model_textures
SET texture_photo_url = REPLACE(texture_photo_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE texture_photo_url LIKE 'https://claypixels.eu/storage/%';

UPDATE model_textures
SET texture_photo_url = REPLACE(texture_photo_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE texture_photo_url LIKE 'http://claypixels.eu/storage/%';

-- Fix processed texture URLs
UPDATE model_textures
SET processed_texture_url = REPLACE(processed_texture_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE processed_texture_url LIKE 'https://claypixels.eu/storage/%';

UPDATE model_textures
SET processed_texture_url = REPLACE(processed_texture_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE processed_texture_url LIKE 'http://claypixels.eu/storage/%';

-- Fix original photo URLs
UPDATE model_textures
SET original_photo_url = REPLACE(original_photo_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE original_photo_url LIKE 'https://claypixels.eu/storage/%';

UPDATE model_textures
SET original_photo_url = REPLACE(original_photo_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE original_photo_url LIKE 'http://claypixels.eu/storage/%';

-- Fix viewer logo URLs
UPDATE viewers
SET logo_url = REPLACE(logo_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE logo_url LIKE 'https://claypixels.eu/storage/%';

UPDATE viewers
SET logo_url = REPLACE(logo_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE logo_url LIKE 'http://claypixels.eu/storage/%';
