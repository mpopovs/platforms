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
