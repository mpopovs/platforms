-- Create function to get all models with ALL their textures
-- This replaces the "latest texture only" behavior

CREATE OR REPLACE FUNCTION get_all_textures_for_viewer(p_viewer_id TEXT)
RETURNS TABLE (
  model_id TEXT,
  model_name TEXT,
  model_file_url TEXT,
  texture_template_url TEXT,
  qr_code_data TEXT,
  qr_code_image_url TEXT,
  order_index INTEGER,
  short_code TEXT,
  uv_map_url TEXT,
  model_created_at TIMESTAMP WITH TIME ZONE,
  model_updated_at TIMESTAMP WITH TIME ZONE,
  texture_id TEXT,
  texture_original_photo_url TEXT,
  texture_corrected_texture_url TEXT,
  texture_uploaded_at TIMESTAMP WITH TIME ZONE,
  texture_processed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vm.id as model_id,
    vm.name as model_name,
    vm.model_file_url,
    vm.texture_template_url,
    vm.qr_code_data,
    vm.qr_code_image_url,
    vm.order_index,
    vm.short_code,
    vm.uv_map_url,
    vm.created_at as model_created_at,
    vm.updated_at as model_updated_at,
    mt.id as texture_id,
    mt.original_photo_url as texture_original_photo_url,
    mt.corrected_texture_url as texture_corrected_texture_url,
    mt.uploaded_at as texture_uploaded_at,
    mt.processed_at as texture_processed_at
  FROM viewer_models vm
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.order_index, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
