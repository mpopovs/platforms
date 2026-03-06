-- Update get_latest_textures_for_classroom_viewer to show classroom-uploaded texture
-- when available, otherwise fall back to the most recent texture from any source.
-- This ensures the classroom viewer always shows a texture even if upload_source_viewer_id
-- is NULL (e.g. textures uploaded before the column was added).
--
-- Fix: queue_number is not a column on model_textures — it comes from texture_queue.
-- Added proper JOINs to texture_queue for both the classroom-specific and fallback paths.
CREATE OR REPLACE FUNCTION get_latest_textures_for_classroom_viewer(
  p_classroom_viewer_id TEXT,
  p_parent_viewer_id TEXT
)
RETURNS TABLE (
  id TEXT,
  viewer_id TEXT,
  name TEXT,
  model_file_url TEXT,
  texture_template_url TEXT,
  qr_code_data TEXT,
  qr_code_image_url TEXT,
  order_index INTEGER,
  short_code TEXT,
  uv_map_url TEXT,
  marker_id_base INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  latest_texture_id TEXT,
  latest_texture_original_photo_url TEXT,
  latest_texture_corrected_texture_url TEXT,
  latest_texture_uploaded_at TIMESTAMP WITH TIME ZONE,
  latest_texture_processed_at TIMESTAMP WITH TIME ZONE,
  latest_texture_author_name TEXT,
  latest_texture_author_age INTEGER,
  latest_texture_queue_number INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vm.id,
    vm.viewer_id,
    vm.name,
    vm.model_file_url,
    vm.texture_template_url,
    vm.qr_code_data,
    vm.qr_code_image_url,
    vm.order_index,
    vm.short_code,
    vm.uv_map_url,
    vm.marker_id_base,
    vm.created_at,
    vm.updated_at,
    COALESCE(cls.id, any_mt.id) AS latest_texture_id,
    COALESCE(cls.original_photo_url, any_mt.original_photo_url) AS latest_texture_original_photo_url,
    COALESCE(cls.corrected_texture_url, any_mt.corrected_texture_url) AS latest_texture_corrected_texture_url,
    COALESCE(cls.uploaded_at, any_mt.uploaded_at) AS latest_texture_uploaded_at,
    COALESCE(cls.processed_at, any_mt.processed_at) AS latest_texture_processed_at,
    COALESCE(cls.author_name, any_mt.author_name) AS latest_texture_author_name,
    COALESCE(cls.author_age, any_mt.author_age) AS latest_texture_author_age,
    COALESCE(cls_tq.queue_number, any_tq.queue_number) AS latest_texture_queue_number
  FROM viewer_models vm
  LEFT JOIN LATERAL (
    SELECT mt.*
    FROM model_textures mt
    WHERE mt.model_id = vm.id
      AND mt.upload_source_viewer_id = p_classroom_viewer_id
    ORDER BY mt.uploaded_at DESC NULLS LAST
    LIMIT 1
  ) cls ON true
  LEFT JOIN texture_queue cls_tq ON cls_tq.texture_id = cls.id AND cls_tq.viewer_id = p_classroom_viewer_id
  LEFT JOIN LATERAL (
    SELECT mt.*
    FROM model_textures mt
    WHERE mt.model_id = vm.id
    ORDER BY mt.uploaded_at DESC NULLS LAST
    LIMIT 1
  ) any_mt ON true
  LEFT JOIN texture_queue any_tq ON any_tq.texture_id = any_mt.id AND any_tq.viewer_id = p_parent_viewer_id
  WHERE vm.viewer_id = p_parent_viewer_id
  ORDER BY vm.order_index ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
