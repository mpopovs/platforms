-- Update get_latest_textures_for_viewer to include short_code
DROP FUNCTION IF EXISTS get_latest_textures_for_viewer(text);

CREATE FUNCTION get_latest_textures_for_viewer(p_viewer_id TEXT)
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
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  latest_texture_id TEXT,
  latest_texture_original_photo_url TEXT,
  latest_texture_corrected_texture_url TEXT,
  latest_texture_uploaded_at TIMESTAMP WITH TIME ZONE,
  latest_texture_processed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (vm.id)
    vm.id,
    vm.viewer_id,
    vm.name,
    vm.model_file_url,
    vm.texture_template_url,
    vm.qr_code_data,
    vm.qr_code_image_url,
    vm.order_index,
    vm.short_code,
    vm.created_at,
    vm.updated_at,
    mt.id as latest_texture_id,
    mt.original_photo_url as latest_texture_original_photo_url,
    mt.corrected_texture_url as latest_texture_corrected_texture_url,
    mt.uploaded_at as latest_texture_uploaded_at,
    mt.processed_at as latest_texture_processed_at
  FROM viewer_models vm
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.id, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
