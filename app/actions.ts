'use server';

import { redis } from '@/lib/redis';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { rootDomain, protocol } from '@/lib/utils';

export async function addCustomDomainAction(
  prevState: any,
  formData: FormData
) {
  const domain = formData.get('domain') as string;

  if (!domain) {
    return { success: false, error: 'Domain is required' };
  }

  // Validate domain format
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  
  if (!domainRegex.test(domain)) {
    return {
      domain,
      success: false,
      error: 'Please enter a valid domain (e.g., example.com)'
    };
  }

  const sanitizedDomain = domain.toLowerCase().trim();

  // Check if domain already exists
  const domainExists = await redis.get(`domain:${sanitizedDomain}`);
  if (domainExists) {
    return {
      domain,
      success: false,
      error: 'This domain is already registered'
    };
  }

  // Store domain with metadata
  await redis.set(`domain:${sanitizedDomain}`, {
    createdAt: Date.now(),
    verified: false
  });

  revalidatePath('/admin');
  return { success: true, domain: sanitizedDomain };
}

export async function deleteCustomDomainAction(
  prevState: any,
  formData: FormData
) {
  const domain = formData.get('domain');
  await redis.del(`domain:${domain}`);
  revalidatePath('/admin');
  return { success: 'Domain deleted successfully' };
}

export async function verifyCustomDomainAction(
  prevState: any,
  formData: FormData
) {
  const domain = formData.get('domain') as string;
  
  // Here you would typically check DNS records
  // For now, we'll just mark it as verified
  const domainData = await redis.get(`domain:${domain}`);
  
  if (!domainData) {
    return { success: false, error: 'Domain not found' };
  }

  await redis.set(`domain:${domain}`, {
    ...(domainData as any),
    verified: true,
    verifiedAt: Date.now()
  });

  revalidatePath('/admin/domains');
  return { success: true, message: 'Domain verified successfully' };
}

// Simple wrappers for form actions (without prevState)
export async function verifyDomainFormAction(formData: FormData) {
  'use server';
  await verifyCustomDomainAction(null, formData);
}

export async function deleteDomainFormAction(formData: FormData) {
  'use server';
  await deleteCustomDomainAction(null, formData);
}

// ============================================
// VIEWER ACTIONS
// ============================================

import bcrypt from 'bcryptjs';
import {
  generateViewerId,
  generatePin,
  ViewerConfig
} from '@/lib/types/viewer';
import {
  saveViewerConfig,
  deleteViewerConfig,
  addViewerToUser,
  getAllUserViewerConfigs,
  getViewerConfig
} from '@/lib/viewers';
import { generateShortCode, createShortUploadUrl } from '@/lib/short-links';
import { createClient } from '@/lib/supabase/server';

/**
 * Create a new viewer
 */
export async function createViewerAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in to create a viewer' };
  }

  const name = formData.get('name') as string;
  const displayTitle = formData.get('displayTitle') as string;
  const displayMessage = formData.get('displayMessage') as string;
  
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Viewer name is required' };
  }

  // Generate viewer ID, PIN, and short code
  const viewerId = generateViewerId();
  const plainPin = generatePin();
  const hashedPin = await bcrypt.hash(plainPin, 10);
  const shortCode = generateShortCode();

  const viewerConfig: ViewerConfig = {
    id: viewerId,
    userId: user.id,
    name: name.trim(),
    pin: hashedPin,
    shortCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      displayTitle: displayTitle || name,
      displayMessage: displayMessage || '',
      backgroundColor: '#ffffff',
      textColor: '#000000',
    }
  };

  // Save to Supabase with authenticated client
  await saveViewerConfig(viewerConfig, supabase);
  await addViewerToUser(user.id, viewerId);

  revalidatePath('/admin/viewers');
  
  return { 
    success: true, 
    viewerId,
    pin: plainPin, // Return plain PIN only once
    message: 'Viewer created successfully'
  };
}

/**
 * Update viewer configuration
 */
export async function updateViewerAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  const name = formData.get('name') as string;
  const displayTitle = formData.get('displayTitle') as string;
  const displayMessage = formData.get('displayMessage') as string;
  const backgroundColor = formData.get('backgroundColor') as string;
  const textColor = formData.get('textColor') as string;

  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  const updatedConfig: ViewerConfig = {
    ...existingConfig,
    name: name || existingConfig.name,
    updatedAt: Date.now(),
    settings: {
      ...existingConfig.settings,
      displayTitle: displayTitle || existingConfig.settings.displayTitle,
      displayMessage: displayMessage || existingConfig.settings.displayMessage,
      backgroundColor: backgroundColor || existingConfig.settings.backgroundColor,
      textColor: textColor || existingConfig.settings.textColor,
    }
  };

  await saveViewerConfig(updatedConfig);
  revalidatePath('/admin/viewers');
  
  return { success: true, message: 'Viewer updated successfully' };
}

/**
 * Update viewer display settings
 */
export async function updateViewerSettingsAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  
  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Parse display mode settings from form
  const displayModes = {
    standardMode: {
      duration: Number(formData.get('standardDuration')) || 5,
      rotationSpeed: Number(formData.get('standardRotationSpeed')) || 0.5,
      enabled: true
    },
    newUploadMode: {
      duration: Number(formData.get('newUploadDuration')) || 8,
      highlightEffect: (formData.get('newUploadHighlight') as 'glow' | 'border' | 'pulse' | 'none') || 'glow',
      soundAlert: false,
      enabled: formData.get('newUploadEnabled') === 'on'
    },
    showcaseMode: {
      enabled: formData.get('showcaseEnabled') === 'on',
      frequency: Number(formData.get('showcaseFrequency')) || 18,
      duration: Number(formData.get('showcaseDuration')) || 60,
      textureInterval: Number(formData.get('showcaseInterval')) || 1.5
    },
    detailedMode: {
      duration: Number(formData.get('detailedDuration')) || 8,
      featuredModels: []
    },
    interactionSettings: {
      pauseOnTouch: formData.get('pauseOnTouch') === 'on',
      manualNavigation: formData.get('manualNavigation') === 'on',
      autoResumeAfter: Number(formData.get('autoResumeAfter')) || 15
    }
  };

  const updatedConfig: ViewerConfig = {
    ...existingConfig,
    updatedAt: Date.now(),
    settings: {
      ...existingConfig.settings,
      displayModes
    }
  };

  try {
    await saveViewerConfig(updatedConfig);
    revalidatePath('/admin/viewers');
    revalidatePath(`/viewer/${viewerId}`);
    
    return { success: true, message: 'Display settings updated successfully' };
  } catch (error: any) {
    console.error('Failed to save viewer settings:', error);
    return { success: false, error: `Failed to save: ${error.message}` };
  }
}

/**
 * Delete viewer
 */
export async function deleteViewerAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  
  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  await deleteViewerConfig(viewerId, user.id, supabase);
  revalidatePath('/admin/viewers');
  
  return { success: true, message: 'Viewer deleted successfully' };
}

/**
 * Generate new PIN for viewer
 */
export async function generateNewPinAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  
  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Generate new PIN
  const plainPin = generatePin();
  const hashedPin = await bcrypt.hash(plainPin, 10);

  const updatedConfig: ViewerConfig = {
    ...existingConfig,
    pin: hashedPin,
    updatedAt: Date.now(),
  };

  await saveViewerConfig(updatedConfig, supabase);
  
  // Store plain PIN temporarily for admin retrieval (expires in 30 days)
  await redis.set(`viewer:${viewerId}:plain_pin`, plainPin, { ex: 60 * 60 * 24 * 30 });
  
  // Invalidate all existing sessions for this viewer (forces re-authentication with new PIN)
  const { invalidateAllViewerSessions } = await import('@/lib/viewers');
  await invalidateAllViewerSessions(viewerId);
  
  revalidatePath('/admin/viewers');
  
  return { 
    success: true, 
    pin: plainPin,
    message: 'New PIN generated successfully. All existing viewer sessions have been invalidated.'
  };
}

/**
 * Get current PIN for viewer (admin only)
 */
export async function getCurrentPinAction(viewerId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get plain PIN from Redis
  const plainPin = await redis.get<string>(`viewer:${viewerId}:plain_pin`);
  
  if (!plainPin) {
    return { 
      success: false, 
      error: 'PIN not available. Generate a new PIN to view it.',
      needsGeneration: true
    };
  }
  
  return { 
    success: true, 
    pin: plainPin
  };
}

/**
 * Get all viewers for current user
 */
export async function getAllViewersAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return [];
  }

  const viewers = await getAllUserViewerConfigs(user.id, supabase);
  
  // Don't return the hashed PIN
  return viewers.map(v => ({
    ...v,
    pin: undefined // Hide PIN hash from client
  }));
}

/**
 * Generate embed token for viewer (user ownership check only)
 */
import { generateEmbedToken } from '@/lib/types/viewer';
import { createEmbedToken } from '@/lib/viewers';

export async function generateEmbedTokenAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;

  const existingConfig = await getViewerConfig(viewerId);
  
  if (!existingConfig) {
    return { success: false, error: 'Viewer not found' };
  }
  
  if (existingConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Generate embed token (no PIN validation needed here - PIN will be required when viewing)
  const embedToken = generateEmbedToken();
  await createEmbedToken(embedToken, viewerId, user.id);

  return { 
    success: true, 
    embedToken,
    message: 'Embed token generated successfully'
  };
}

// ============================================================================
// 3D Model Management Actions
// ============================================================================

import { 
  getViewerModels,
  getViewerModel,
  createViewerModel,
  updateViewerModel,
  deleteViewerModel,
  reorderViewerModels,
  getViewerModelsWithTextures
} from '@/lib/viewers';
import { generateModelId, type QRCodeData } from '@/lib/types/viewer';
import { 
  upload3DModel,
  uploadQRCodeImage,
  uploadTextureTemplate,
  isValid3DModelFile,
  isValidFileSize
} from '@/lib/storage';
import { 
  createQRCodeData,
  generateQRCodeBuffer,
  generateTextureTemplate
} from '@/lib/qr-codes';

/**
 * Upload a 3D model to a viewer
 */
export async function upload3DModelAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  const modelName = formData.get('modelName') as string;
  const modelFile = formData.get('modelFile') as File;

  if (!viewerId || !modelName || !modelFile) {
    return { success: false, error: 'All fields are required' };
  }

  // Verify user owns the viewer
  const viewerConfig = await getViewerConfig(viewerId);
  if (!viewerConfig || viewerConfig.userId !== user.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate file
  if (!isValid3DModelFile(modelFile)) {
    return { success: false, error: 'Invalid 3D model file. Supported formats: .glb, .gltf, .obj, .fbx' };
  }

  if (!isValidFileSize(modelFile, 50)) { // 50MB max
    return { success: false, error: 'File too large. Maximum size: 50MB' };
  }

  try {
    // Generate model ID and short code
    const modelId = generateModelId();
    const shortCode = generateShortCode();

    // Upload 3D model file
    const modelFileUrl = await upload3DModel(user.id, viewerId, modelId, modelFile, supabase);

    // Generate URLs
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
    const baseUrl = `${protocol}://${rootDomain}`;

    // Use short URL for QR code (simpler, less dense)
    const qrCodeUrl = createShortUploadUrl(baseUrl, shortCode);

    // Get next order index and calculate marker ID base
    const existingModels = await getViewerModels(viewerId);
    
    // Find the maximum order_index among existing models, then add 1
    // This handles gaps from deleted models
    const maxOrderIndex = existingModels.length > 0 
      ? Math.max(...existingModels.map(m => m.order_index ?? 0))
      : -1;
    const nextOrderIndex = maxOrderIndex + 1;
    
    // Calculate marker ID base: each model uses 4 consecutive marker IDs
    // Model 0 uses markers 0-3, Model 1 uses markers 4-7, etc.
    // Max marker ID in DICT_6X6_1000 is 999, so we support up to 250 models per viewer
    const markerIdBase = nextOrderIndex * 4;

    // Create model record with short code and marker ID base
    await createViewerModel(
      modelId,
      viewerId,
      modelName,
      modelFileUrl,
      null, // texture_template_url (generated on-demand via API)
      qrCodeUrl,
      null, // qr_code_image_url (generated on-demand via API)
      nextOrderIndex,
      supabase,
      shortCode, // Add short code
      markerIdBase // Add marker ID base for auto-detection
    );

    revalidatePath('/admin/viewers');
    return { 
      success: true, 
      modelId,
      message: 'Model uploaded successfully' 
    };
  } catch (error: any) {
    console.error('Error uploading 3D model:', error);
    return { success: false, error: error.message || 'Failed to upload model' };
  }
}

/**
 * Delete a 3D model from a viewer
 */
export async function delete3DModelAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const modelId = formData.get('modelId') as string;
  const viewerId = formData.get('viewerId') as string;

  console.log('Delete model action called:', { modelId, viewerId });

  if (!modelId) {
    return { success: false, error: 'Model ID is required' };
  }

  try {
    // Get model and verify ownership
    const model = await getViewerModel(modelId, supabase);
    console.log('Found model:', model);
    
    if (!model) {
      return { success: false, error: 'Model not found' };
    }

    const viewerConfig = await getViewerConfig(model.viewer_id, supabase);
    console.log('Found viewer config:', viewerConfig);
    
    if (!viewerConfig || viewerConfig.userId !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Delete model (cascade deletes textures)
    await deleteViewerModel(modelId, supabase);
    console.log('Model deleted successfully:', modelId);

    revalidatePath('/admin/viewers');
    return { success: true, message: 'Model deleted successfully' };
  } catch (error: any) {
    console.error('Error deleting 3D model:', error);
    return { success: false, error: error.message || 'Failed to delete model' };
  }
}

/**
 * Replace the 3D model file while keeping all metadata (URLs, IDs, textures, etc.)
 */
export async function replaceModelFileAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const modelId = formData.get('modelId') as string;
  const viewerId = formData.get('viewerId') as string;
  const modelFile = formData.get('modelFile') as File;

  if (!modelId || !viewerId || !modelFile) {
    return { success: false, error: 'Model ID, Viewer ID, and model file are required' };
  }

  // Validate file
  if (!isValid3DModelFile(modelFile)) {
    return { success: false, error: 'Invalid 3D model file. Supported formats: .glb, .gltf, .obj, .fbx' };
  }

  if (!isValidFileSize(modelFile, 50)) { // 50MB max
    return { success: false, error: 'File too large. Maximum size: 50MB' };
  }

  try {
    // Get model and verify ownership
    const model = await getViewerModel(modelId, supabase);
    if (!model) {
      return { success: false, error: 'Model not found' };
    }

    const viewerConfig = await getViewerConfig(model.viewer_id, supabase);
    if (!viewerConfig || viewerConfig.userId !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Delete old model file from storage if it exists
    if (model.model_file_url) {
      try {
        // Extract path from URL
        const url = new URL(model.model_file_url);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/3d-models\/(.+)/);
        if (pathMatch) {
          await supabase.storage
            .from('3d-models')
            .remove([pathMatch[1]]);
        }
      } catch (deleteError) {
        console.warn('Could not delete old model file:', deleteError);
        // Continue anyway - new file will be uploaded
      }
    }

    // Upload new model file
    const fileName = `${user.id}/${viewerId}/${modelId}/${modelFile.name}`;
    
    const { data, error: uploadError } = await supabase.storage
      .from('3d-models')
      .upload(fileName, modelFile, {
        cacheControl: '3600',
        upsert: true // Allow overwrite
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload 3D model: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('3d-models')
      .getPublicUrl(data.path);
    
    const newModelFileUrl = urlData.publicUrl;

    // Update only the model_file_url in the database
    const { error: updateError } = await supabase
      .from('viewer_models')
      .update({ model_file_url: newModelFileUrl })
      .eq('id', modelId);

    if (updateError) {
      throw new Error(`Failed to update model: ${updateError.message}`);
    }

    revalidatePath('/admin/viewers');
    return { 
      success: true, 
      message: 'Model file replaced successfully',
      newUrl: newModelFileUrl
    };
  } catch (error: any) {
    console.error('Error replacing 3D model file:', error);
    return { success: false, error: error.message || 'Failed to replace model file' };
  }
}

/**
 * Reorder models in a viewer
 */
export async function reorderModelsAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const viewerId = formData.get('viewerId') as string;
  const modelIdsJson = formData.get('modelIds') as string;

  if (!viewerId || !modelIdsJson) {
    return { success: false, error: 'Viewer ID and model order are required' };
  }

  try {
    // Verify user owns the viewer
    const viewerConfig = await getViewerConfig(viewerId);
    if (!viewerConfig || viewerConfig.userId !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const modelIds = JSON.parse(modelIdsJson) as string[];
    await reorderViewerModels(viewerId, modelIds, supabase);

    revalidatePath('/admin/viewers');
    return { success: true, message: 'Models reordered successfully' };
  } catch (error: any) {
    console.error('Error reordering models:', error);
    return { success: false, error: error.message || 'Failed to reorder models' };
  }
}

/**
 * Get all models for a viewer
 */
export async function getViewerModelsAction(viewerId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return [];
  }

  // Verify user owns the viewer
  const viewerConfig = await getViewerConfig(viewerId);
  if (!viewerConfig || viewerConfig.userId !== user.id) {
    return [];
  }

  return getViewerModels(viewerId);
}

/**
 * Get models with textures for viewer display (public access after PIN auth)
 */
export async function getViewerModelsWithTexturesAction(viewerId: string) {
  // This is called after PIN authentication, so no user check needed
  // Just verify viewer exists
  const viewerConfig = await getViewerConfig(viewerId);
  if (!viewerConfig) {
    return [];
  }

  return getViewerModelsWithTextures(viewerId);
}

/**
 * Delete a texture from a model
 */
export async function deleteTextureAction(
  prevState: any,
  formData: FormData
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: 'You must be logged in' };
  }

  const textureId = formData.get('textureId') as string;
  const modelId = formData.get('modelId') as string;

  if (!textureId || !modelId) {
    return { success: false, error: 'Texture ID and Model ID are required' };
  }

  try {
    // Get model and verify ownership
    const model = await getViewerModel(modelId, supabase);
    
    if (!model) {
      return { success: false, error: 'Model not found' };
    }

    const viewerConfig = await getViewerConfig(model.viewer_id, supabase);
    
    if (!viewerConfig || viewerConfig.userId !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Delete texture
    const { deleteModelTexture } = await import('@/lib/viewers');
    await deleteModelTexture(textureId);

    revalidatePath('/admin/viewers');
    return { success: true, message: 'Texture deleted successfully' };
  } catch (error: any) {
    console.error('Error deleting texture:', error);
    return { success: false, error: error.message || 'Failed to delete texture' };
  }
}
