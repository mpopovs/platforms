-- Fix: textures uploaded via a classroom viewer have texture_queue.viewer_id = classroom_viewer_id.
-- When the museum (parent) display calls these functions with p_viewer_id = museum_viewer_id,
-- the join condition `tq.viewer_id = p_viewer_id` fails to match, returning NULL queue_number.
-- Since queue_number is a globally-unique counter and each texture has exactly one queue entry,
-- the viewer_id filter is not needed — join on texture_id only.

-- Fix get_all_textures_for_viewer (used for texture-cycling mode on the museum display)
DROP FUNCTION IF EXISTS get_all_textures_for_viewer(text);

CREATE FUNCTION get_all_textures_for_viewer(p_viewer_id TEXT)
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
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  LEFT JOIN texture_queue tq ON tq.texture_id = mt.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.order_index, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Fix get_latest_textures_for_viewer (used for non-cycling / legacy display on the museum display)
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
    vm.uv_map_url,
    vm.marker_id_base,
    vm.created_at,
    vm.updated_at,
    mt.id AS latest_texture_id,
    mt.original_photo_url AS latest_texture_original_photo_url,
    mt.corrected_texture_url AS latest_texture_corrected_texture_url,
    mt.uploaded_at AS latest_texture_uploaded_at,
    mt.processed_at AS latest_texture_processed_at,
    mt.author_name AS latest_texture_author_name,
    mt.author_age AS latest_texture_author_age,
    tq.queue_number AS latest_texture_queue_number
  FROM viewer_models vm
  LEFT JOIN model_textures mt ON mt.model_id = vm.id
  LEFT JOIN texture_queue tq ON tq.texture_id = mt.id
  WHERE vm.viewer_id = p_viewer_id
  ORDER BY vm.id, mt.uploaded_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
