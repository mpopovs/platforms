-- Add get_all_textures_for_classroom_viewer function.
-- Like get_all_textures_for_viewer but scoped to a single classroom:
-- returns parent viewer's models, only textures whose upload_source_viewer_id
-- matches the classroom viewer, and includes queue_number (joined on texture_id
-- only — no viewer_id filter — so classroom-uploaded entries are found correctly).

CREATE OR REPLACE FUNCTION get_all_textures_for_classroom_viewer(
  p_classroom_viewer_id TEXT,
  p_parent_viewer_id TEXT
)
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
  marker_id_base INTEGER,
  model_created_at TIMESTAMP WITH TIME ZONE,
  model_updated_at TIMESTAMP WITH TIME ZONE,
  texture_id TEXT,
  texture_original_photo_url TEXT,
  texture_corrected_texture_url TEXT,
  texture_uploaded_at TIMESTAMP WITH TIME ZONE,
  texture_processed_at TIMESTAMP WITH TIME ZONE,
  texture_author_name TEXT,
  texture_author_age INTEGER,
  texture_queue_number INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vm.id AS model_id,
    vm.name AS model_name,
    vm.model_file_url,
    vm.texture_template_url,
    vm.qr_code_data,
    vm.qr_code_image_url,
    vm.order_index,
    vm.short_code,
    vm.uv_map_url,
    vm.marker_id_base,
    vm.created_at AS model_created_at,
    vm.updated_at AS model_updated_at,
    mt.id AS texture_id,
    mt.original_photo_url AS texture_original_photo_url,
    mt.corrected_texture_url AS texture_corrected_texture_url,
    mt.uploaded_at AS texture_uploaded_at,
    mt.processed_at AS texture_processed_at,
    mt.author_name AS texture_author_name,
    mt.author_age AS texture_author_age,
    tq.queue_number AS texture_queue_number
  FROM viewer_models vm
  LEFT JOIN model_textures mt
    ON mt.model_id = vm.id
    AND mt.upload_source_viewer_id = p_classroom_viewer_id
  LEFT JOIN texture_queue tq ON tq.texture_id = mt.id
  WHERE vm.viewer_id = p_parent_viewer_id
  ORDER BY vm.order_index, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
