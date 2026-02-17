-- Fix all model_file_url in viewer_models table
-- Run this to check which URLs will be updated:

SELECT 
  id,
  name,
  model_file_url as old_url,
  CASE 
    WHEN model_file_url LIKE 'https://claypixels.eu/storage/%' THEN 
      REPLACE(model_file_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
    WHEN model_file_url LIKE 'http://claypixels.eu/storage/%' THEN 
      REPLACE(model_file_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
    WHEN model_file_url LIKE 'https://claypixels.eu:8000/storage/%' THEN 
      REPLACE(model_file_url, 'https://claypixels.eu:8000/storage/', 'https://db.claypixels.eu/storage/')
    WHEN model_file_url LIKE 'http://claypixels.eu:8000/storage/%' THEN 
      REPLACE(model_file_url, 'http://claypixels.eu:8000/storage/', 'https://db.claypixels.eu/storage/')
    ELSE model_file_url
  END as new_url
FROM viewer_models
WHERE 
  model_file_url LIKE '%claypixels.eu/storage/%' 
  AND model_file_url NOT LIKE 'https://db.claypixels.eu/storage/%';

-- Once verified, run these UPDATE statements:

-- Fix https://claypixels.eu URLs
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'https://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'https://claypixels.eu/storage/%';

-- Fix http://claypixels.eu URLs
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'http://claypixels.eu/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'http://claypixels.eu/storage/%';

-- Fix URLs with port 8000 (https)
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'https://claypixels.eu:8000/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'https://claypixels.eu:8000/storage/%';

-- Fix URLs with port 8000 (http)
UPDATE viewer_models
SET model_file_url = REPLACE(model_file_url, 'http://claypixels.eu:8000/storage/', 'https://db.claypixels.eu/storage/')
WHERE model_file_url LIKE 'http://claypixels.eu:8000/storage/%';

-- Verify the fix:
SELECT 
  id,
  name,
  model_file_url,
  CASE 
    WHEN model_file_url LIKE 'https://db.claypixels.eu/storage/%' THEN '✅ Correct'
    ELSE '❌ Needs fixing'
  END as status
FROM viewer_models
ORDER BY status, name;
