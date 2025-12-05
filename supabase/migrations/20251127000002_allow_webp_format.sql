-- Update storage buckets to allow WebP format
-- WebP provides better compression for textures

-- Update processed-textures bucket to allow WebP mime type
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
WHERE id = 'processed-textures';

-- Update user-texture-photos bucket to allow WebP and common image formats
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'user-texture-photos';

-- Update texture-templates bucket to allow WebP
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
WHERE id = 'texture-templates';

-- Update deleted-images bucket to allow all image formats
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp']
WHERE id = 'deleted-images';
