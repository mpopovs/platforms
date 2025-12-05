import { redis } from './redis';
import { supabase } from './supabase';
import { 
  ViewerConfig, 
  ViewerSession, 
  ViewerAttempt,
  ViewerKeys,
  ViewerRow,
  ViewerModelRow,
  ModelTextureRow,
  ViewerModelWithTexture,
  ViewerModelWithAllTextures
} from './types/viewer';

/**
 * Get viewer configuration from Supabase
 */
export async function getViewerConfig(viewerId: string, supabaseClient?: any): Promise<ViewerConfig | null> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('viewers')
    .select('*')
    .eq('id', viewerId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  const row = data as ViewerRow;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    pin: row.pin_hash,
    shortCode: row.short_code,
    logo_url: row.logo_url,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    settings: row.settings
  };
}

/**
 * Get viewer configuration by short code from Supabase
 */
export async function getViewerConfigByShortCode(shortCode: string, supabaseClient?: any): Promise<ViewerConfig | null> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('viewers')
    .select('*')
    .eq('short_code', shortCode)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  const row = data as ViewerRow;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    pin: row.pin_hash,
    shortCode: row.short_code,
    logo_url: row.logo_url,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    settings: row.settings
  };
}

/**
 * Save viewer configuration to Supabase
 */
export async function saveViewerConfig(config: ViewerConfig, supabaseClient?: any): Promise<void> {
  const client = supabaseClient || supabase;
  
  // For updates, use update instead of upsert to ensure settings are properly merged
  const { data: existing } = await client
    .from('viewers')
    .select('id')
    .eq('id', config.id)
    .single();
  
  if (existing) {
    // Update existing viewer
    const { error } = await client
      .from('viewers')
      .update({
        name: config.name,
        pin_hash: config.pin,
        short_code: config.shortCode,
        settings: config.settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id)
      .eq('user_id', config.userId);
    
    if (error) {
      throw new Error(`Failed to update viewer: ${error.message}`);
    }
  } else {
    // Insert new viewer
    const row: Partial<ViewerRow> = {
      id: config.id,
      user_id: config.userId,
      name: config.name,
      pin_hash: config.pin,
      short_code: config.shortCode,
      settings: config.settings
    };
    
    const { error } = await client
      .from('viewers')
      .insert(row);
    
    if (error) {
      throw new Error(`Failed to create viewer: ${error.message}`);
    }
  }
}

/**
 * Delete viewer configuration from Supabase
 */
export async function deleteViewerConfig(viewerId: string, userId: string, supabaseClient?: any): Promise<void> {
  const client = supabaseClient || supabase;
  // Cascade delete will handle viewer_models and model_textures
  const { error } = await client
    .from('viewers')
    .delete()
    .eq('id', viewerId)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to delete viewer: ${error.message}`);
  }
}

/**
 * Get all viewers for a user (just IDs for backwards compatibility)
 */
export async function getUserViewers(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('viewers')
    .select('id')
    .eq('user_id', userId);
  
  if (error || !data) {
    return [];
  }
  
  return data.map((row: { id: string }) => row.id);
}

/**
 * Add viewer to user's list (handled by database insert now)
 */
export async function addViewerToUser(userId: string, viewerId: string): Promise<void> {
  // This is now handled automatically by database insert
  // Keeping function for backwards compatibility
}

/**
 * Get all viewer configs for a user
 */
export async function getAllUserViewerConfigs(userId: string, supabaseClient?: any): Promise<ViewerConfig[]> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('viewers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error || !data) {
    console.error('Error fetching viewers:', error);
    return [];
  }
  
  return data.map((row: ViewerRow) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    pin: row.pin_hash,
    shortCode: row.short_code,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    settings: row.settings
  }));
}

/**
 * Create viewer session
 */
export async function createViewerSession(
  token: string,
  viewerId: string,
  userId: string,
  ip: string,
  expiresInSeconds: number = 3600 // 1 hour default
): Promise<void> {
  const session: ViewerSession = {
    viewerId,
    userId,
    ip,
    expiresAt: Date.now() + (expiresInSeconds * 1000),
    createdAt: Date.now()
  };
  
  await redis.setex(ViewerKeys.session(token), expiresInSeconds, session);
}

/**
 * Get viewer session
 */
export async function getViewerSession(token: string): Promise<ViewerSession | null> {
  const session = await redis.get(ViewerKeys.session(token));
  return session as ViewerSession | null;
}

/**
 * Delete viewer session
 */
export async function deleteViewerSession(token: string): Promise<void> {
  await redis.del(ViewerKeys.session(token));
}

/**
 * Invalidate all sessions for a viewer (when PIN changes)
 */
export async function invalidateAllViewerSessions(viewerId: string): Promise<void> {
  // Get all session keys for this viewer
  const sessionKeys = await redis.keys(`viewer:session:*`);
  
  if (sessionKeys.length === 0) {
    return;
  }
  
  // Get all sessions
  const sessions = await redis.mget(...sessionKeys);
  
  // Filter and delete sessions for this viewer
  const keysToDelete: string[] = [];
  sessions.forEach((session, index) => {
    if (session && typeof session === 'object' && 'viewerId' in session) {
      if ((session as ViewerSession).viewerId === viewerId) {
        keysToDelete.push(sessionKeys[index]);
      }
    }
  });
  
  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }
}

/**
 * Get viewer attempts for IP
 */
export async function getViewerAttempts(viewerId: string, ip: string): Promise<ViewerAttempt> {
  const attempts = await redis.get(ViewerKeys.attempts(viewerId, ip));
  return attempts as ViewerAttempt || { count: 0, lockedUntil: null, lastAttempt: 0 };
}

/**
 * Increment viewer attempts
 */
export async function incrementViewerAttempts(
  viewerId: string, 
  ip: string,
  maxAttempts: number = 5,
  lockDurationMinutes: number = 15
): Promise<ViewerAttempt> {
  const attempts = await getViewerAttempts(viewerId, ip);
  attempts.count += 1;
  attempts.lastAttempt = Date.now();
  
  // Lock if max attempts reached
  if (attempts.count >= maxAttempts) {
    attempts.lockedUntil = Date.now() + (lockDurationMinutes * 60 * 1000);
  }
  
  // Store for 24 hours
  await redis.setex(ViewerKeys.attempts(viewerId, ip), 86400, attempts);
  
  return attempts;
}

/**
 * Reset viewer attempts
 */
export async function resetViewerAttempts(viewerId: string, ip: string): Promise<void> {
  await redis.del(ViewerKeys.attempts(viewerId, ip));
}

/**
 * Check if viewer is locked for IP
 */
export async function isViewerLocked(viewerId: string, ip: string): Promise<boolean> {
  const attempts = await getViewerAttempts(viewerId, ip);
  
  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    return true;
  }
  
  // If lock expired, reset attempts
  if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
    await resetViewerAttempts(viewerId, ip);
  }
  
  return false;
}

/**
 * Create embed token (long-lived, for iframe URLs)
 */
export async function createEmbedToken(
  token: string,
  viewerId: string,
  createdBy: string
): Promise<void> {
  const embedTokenData = {
    viewerId,
    createdBy,
    createdAt: Date.now(),
  };
  
  // Store token indefinitely (or set a very long expiration like 10 years)
  await redis.set(ViewerKeys.embedToken(token), embedTokenData);
  
  // Also track all embed tokens for a viewer (for revocation)
  const existingTokens = await redis.get(ViewerKeys.viewerEmbedTokens(viewerId));
  const tokens = (existingTokens as string[]) || [];
  tokens.push(token);
  await redis.set(ViewerKeys.viewerEmbedTokens(viewerId), tokens);
}

/**
 * Get embed token data
 */
export async function getEmbedToken(token: string): Promise<{ viewerId: string; createdBy: string; createdAt: number } | null> {
  const data = await redis.get(ViewerKeys.embedToken(token));
  return data as { viewerId: string; createdBy: string; createdAt: number } | null;
}

/**
 * Revoke all embed tokens for a viewer
 */
export async function revokeAllEmbedTokens(viewerId: string): Promise<void> {
  const tokens = await redis.get(ViewerKeys.viewerEmbedTokens(viewerId));
  if (tokens && Array.isArray(tokens)) {
    for (const token of tokens) {
      await redis.del(ViewerKeys.embedToken(token));
    }
  }
  await redis.del(ViewerKeys.viewerEmbedTokens(viewerId));
}

// ============================================================================
// 3D Model Management Functions
// ============================================================================

/**
 * Get all models for a viewer
 */
export async function getViewerModels(viewerId: string): Promise<ViewerModelRow[]> {
  const { data, error } = await supabase
    .from('viewer_models')
    .select('*')
    .eq('viewer_id', viewerId)
    .order('order_index', { ascending: true });
  
  if (error || !data) {
    return [];
  }
  
  return data as ViewerModelRow[];
}

/**
 * Get a single model by ID
 */
export async function getViewerModel(modelId: string, supabaseClient?: any): Promise<ViewerModelRow | null> {
  const client = supabaseClient || supabase;
  const { data, error } = await client
    .from('viewer_models')
    .select('*')
    .eq('id', modelId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data as ViewerModelRow;
}

/**
 * Get models with their latest textures for a viewer
 * Sorted by latest texture upload time (for carousel display)
 */
export async function getViewerModelsWithTextures(viewerId: string): Promise<ViewerModelWithTexture[]> {
  // Use the database function we created
  const { data, error } = await supabase
    .rpc('get_latest_textures_for_viewer', { p_viewer_id: viewerId });
  
  if (error) {
    console.error('Error fetching models with textures:', error);
    // Fallback to basic query
    return getViewerModels(viewerId);
  }
  
  if (!data) {
    return [];
  }
  
  // Map the data to include latest_texture object
  const models = (data as any[]).map(row => {
    const model: ViewerModelWithTexture = {
      id: row.id,
      viewer_id: row.viewer_id,
      name: row.name,
      model_file_url: row.model_file_url,
      texture_template_url: row.texture_template_url,
      qr_code_data: row.qr_code_data,
      qr_code_image_url: row.qr_code_image_url,
      order_index: row.order_index,
      short_code: row.short_code,
      uv_map_url: row.uv_map_url,
      marker_id_base: row.marker_id_base,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    
    // Add latest_texture if it exists
    if (row.latest_texture_id) {
      model.latest_texture = {
        id: row.latest_texture_id,
        model_id: row.id,
        original_photo_url: row.latest_texture_original_photo_url,
        corrected_texture_url: row.latest_texture_corrected_texture_url,
        uploaded_at: row.latest_texture_uploaded_at,
        processed_at: row.latest_texture_processed_at,
        author_name: row.latest_texture_author_name,
        author_age: row.latest_texture_author_age
      };
    }
    
    return model;
  });
  
  // Sort by uploaded_at DESC (newest textures first), then by order_index
  return models.sort((a, b) => {
    if (a.latest_texture?.uploaded_at && b.latest_texture?.uploaded_at) {
      return new Date(b.latest_texture.uploaded_at).getTime() - new Date(a.latest_texture.uploaded_at).getTime();
    }
    if (a.latest_texture?.uploaded_at) return -1;
    if (b.latest_texture?.uploaded_at) return 1;
    return a.order_index - b.order_index;
  });
}

/**
 * Get all models with ALL their textures for a viewer
 * Returns each model with an array of all its textures
 */
export async function getViewerModelsWithAllTextures(viewerId: string): Promise<ViewerModelWithAllTextures[]> {
  // Use the new database function we created
  const { data, error } = await supabase
    .rpc('get_all_textures_for_viewer', { p_viewer_id: viewerId });
  
  if (error) {
    console.error('Error fetching models with all textures:', error);
    return [];
  }
  
  if (!data || data.length === 0) {
    return [];
  }
  
  // Group textures by model
  const modelMap = new Map<string, ViewerModelWithAllTextures>();
  
  for (const row of data as any[]) {
    if (!modelMap.has(row.model_id)) {
      modelMap.set(row.model_id, {
        id: row.model_id,
        viewer_id: viewerId,
        name: row.model_name,
        model_file_url: row.model_file_url,
        texture_template_url: row.texture_template_url,
        qr_code_data: row.qr_code_data,
        qr_code_image_url: row.qr_code_image_url,
        order_index: row.order_index,
        short_code: row.short_code,
        uv_map_url: row.uv_map_url,
        created_at: row.model_created_at,
        updated_at: row.model_updated_at,
        textures: []
      });
    }
    
    // Add texture if it exists
    if (row.texture_id) {
      const model = modelMap.get(row.model_id)!;
      model.textures.push({
        id: row.texture_id,
        model_id: row.model_id,
        original_photo_url: row.texture_original_photo_url,
        corrected_texture_url: row.texture_corrected_texture_url,
        uploaded_at: row.texture_uploaded_at,
        processed_at: row.texture_processed_at,
        author_name: row.texture_author_name,
        author_age: row.texture_author_age
      });
    }
  }
  
  return Array.from(modelMap.values());
}

/**
 * Create a new 3D model for a viewer
 */
export async function createViewerModel(
  modelId: string,
  viewerId: string,
  name: string,
  modelFileUrl: string,
  textureTemplateUrl: string | null,
  qrCodeData: string,
  qrCodeImageUrl: string | null,
  orderIndex: number,
  supabaseClient?: any,
  shortCode?: string,
  markerIdBase?: number
): Promise<ViewerModelRow> {
  const client = supabaseClient || supabase;
  const row: Partial<ViewerModelRow> = {
    id: modelId,
    viewer_id: viewerId,
    name,
    model_file_url: modelFileUrl,
    texture_template_url: textureTemplateUrl,
    qr_code_data: qrCodeData,
    qr_code_image_url: qrCodeImageUrl,
    order_index: orderIndex,
    short_code: shortCode,
    marker_id_base: markerIdBase
  };
  
  const { data, error } = await client
    .from('viewer_models')
    .insert(row)
    .select()
    .single();
  
  if (error || !data) {
    throw new Error(`Failed to create model: ${error?.message}`);
  }
  
  return data as ViewerModelRow;
}

/**
 * Update a 3D model
 */
export async function updateViewerModel(
  modelId: string,
  updates: Partial<ViewerModelRow>,
  supabaseClient?: any
): Promise<void> {
  const client = supabaseClient || supabase;
  const { error } = await client
    .from('viewer_models')
    .update(updates)
    .eq('id', modelId);
  
  if (error) {
    throw new Error(`Failed to update model: ${error.message}`);
  }
}

/**
 * Delete a 3D model (cascade deletes textures from DB and storage)
 */
export async function deleteViewerModel(modelId: string, supabaseClient?: any): Promise<void> {
  const client = supabaseClient || supabase;
  
  // Get model details before deleting
  const { data: model } = await client
    .from('viewer_models')
    .select('viewer_id, model_file_url')
    .eq('id', modelId)
    .single();
  
  if (!model) {
    throw new Error('Model not found');
  }
  
  // Delete from database first (cascade deletes texture records)
  const { error } = await client
    .from('viewer_models')
    .delete()
    .eq('id', modelId);
  
  if (error) {
    throw new Error(`Failed to delete model: ${error.message}`);
  }
  
  // Delete from storage (3D model file and all related textures)
  try {
    // Delete 3D model file
    const { delete3DModel, deleteModelTextures } = await import('./storage');
    const modelPath = `${model.viewer_id}/${modelId}/model.glb`;
    await delete3DModel(modelPath, client).catch(err => console.error('Error deleting 3D model file:', err));
    
    // Delete all texture files for this model
    await deleteModelTextures(model.viewer_id, modelId, client).catch(err => console.error('Error deleting textures:', err));
  } catch (storageError) {
    // Log but don't fail - storage might not be configured
    console.error('Storage cleanup failed:', storageError);
  }
}

/**
 * Reorder models for a viewer
 */
export async function reorderViewerModels(
  viewerId: string,
  modelIdsInOrder: string[],
  supabaseClient?: any
): Promise<void> {
  const client = supabaseClient || supabase;
  // Update each model's order_index
  const updates = modelIdsInOrder.map((modelId, index) => ({
    id: modelId,
    viewer_id: viewerId,
    order_index: index
  }));
  
  const { error } = await client
    .from('viewer_models')
    .upsert(updates);
  
  if (error) {
    throw new Error(`Failed to reorder models: ${error.message}`);
  }
}

// ============================================================================
// Texture Management Functions
// ============================================================================

/**
 * Get all textures for a model
 */
export async function getModelTextures(modelId: string): Promise<ModelTextureRow[]> {
  const { data, error } = await supabase
    .from('model_textures')
    .select('*')
    .eq('model_id', modelId)
    .order('uploaded_at', { ascending: false });
  
  if (error || !data) {
    return [];
  }
  
  return data as ModelTextureRow[];
}

/**
 * Get the latest texture for a model
 */
export async function getLatestModelTexture(modelId: string): Promise<ModelTextureRow | null> {
  const { data, error } = await supabase
    .from('model_textures')
    .select('*')
    .eq('model_id', modelId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data as ModelTextureRow;
}

/**
 * Create a new texture upload record
 */
export async function createModelTexture(
  textureId: string,
  modelId: string,
  originalPhotoUrl: string,
  correctedTextureUrl: string,
  authorName?: string,
  authorAge?: number
): Promise<ModelTextureRow> {
  const row: Partial<ModelTextureRow> = {
    id: textureId,
    model_id: modelId,
    original_photo_url: originalPhotoUrl,
    corrected_texture_url: correctedTextureUrl,
    author_name: authorName,
    author_age: authorAge
  };
  
  const { data, error } = await supabase
    .from('model_textures')
    .insert(row)
    .select()
    .single();
  
  if (error || !data) {
    throw new Error(`Failed to create texture: ${error?.message}`);
  }
  
  return data as ModelTextureRow;
}

/**
 * Delete a texture (moves files to deleted-images bucket first)
 */
export async function deleteModelTexture(textureId: string): Promise<void> {
  // Get texture info before deleting
  const { data: texture, error: fetchError } = await supabase
    .from('model_textures')
    .select('original_photo_url, corrected_texture_url')
    .eq('id', textureId)
    .single();
  
  if (fetchError) {
    throw new Error(`Failed to fetch texture: ${fetchError.message}`);
  }
  
  // Move files to deleted-images bucket
  if (texture) {
    const { deleteTexture } = await import('./storage');
    await deleteTexture(
      textureId,
      texture.original_photo_url,
      texture.corrected_texture_url
    ).catch(err => console.warn('Error archiving texture files:', err));
  }
  
  // Delete from database
  const { error } = await supabase
    .from('model_textures')
    .delete()
    .eq('id', textureId);
  
  if (error) {
    throw new Error(`Failed to delete texture: ${error.message}`);
  }
}
