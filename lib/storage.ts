import { supabase } from './supabase';

export const STORAGE_BUCKETS = {
  MODELS_3D: '3d-models',
  TEXTURE_TEMPLATES: 'texture-templates',
  USER_TEXTURE_PHOTOS: 'user-texture-photos',
  PROCESSED_TEXTURES: 'processed-textures',
  DELETED_IMAGES: 'deleted-images'
} as const;

/**
 * Upload a 3D model file to storage
 */
export async function upload3DModel(
  userId: string,
  viewerId: string,
  modelId: string,
  file: File,
  supabaseClient?: any
): Promise<string> {
  const client = supabaseClient || supabase;
  const fileName = `${userId}/${viewerId}/${modelId}/${file.name}`;
  
  console.log('Uploading 3D model:', fileName, 'Size:', file.size);
  
  const { data, error } = await client.storage
    .from(STORAGE_BUCKETS.MODELS_3D)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });
  
  if (error) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload 3D model: ${error.message || JSON.stringify(error)}`);
  }
  
  if (!data) {
    throw new Error('Upload succeeded but no data returned');
  }
  
  // Get public URL
  const { data: urlData } = client.storage
    .from(STORAGE_BUCKETS.MODELS_3D)
    .getPublicUrl(data.path);
  
  console.log('Upload successful, URL:', urlData.publicUrl);
  return urlData.publicUrl;
}

/**
 * Upload a texture template (with QR code) to storage
 */
export async function uploadTextureTemplate(
  userId: string,
  viewerId: string,
  modelId: string,
  buffer: Buffer,
  fileName: string = 'template.png'
): Promise<string> {
  const filePath = `${userId}/${viewerId}/${modelId}/${fileName}`;
  
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.TEXTURE_TEMPLATES)
    .upload(filePath, buffer, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) {
    throw new Error(`Failed to upload texture template: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKETS.TEXTURE_TEMPLATES)
    .getPublicUrl(data.path);
  
  return urlData.publicUrl;
}

/**
 * Upload QR code image to storage
 */
export async function uploadQRCodeImage(
  userId: string,
  viewerId: string,
  modelId: string,
  buffer: Buffer,
  supabaseClient?: any
): Promise<string> {
  const client = supabaseClient || supabase;
  const fileName = `${userId}/${viewerId}/${modelId}/qr-code.png`;
  
  const { data, error } = await client.storage
    .from(STORAGE_BUCKETS.TEXTURE_TEMPLATES)
    .upload(fileName, buffer, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) {
    throw new Error(`Failed to upload QR code: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = client.storage
    .from(STORAGE_BUCKETS.TEXTURE_TEMPLATES)
    .getPublicUrl(data.path);
  
  return urlData.publicUrl;
}

/**
 * Upload a user's texture photo (original/unprocessed) to user-texture-photos bucket
 */
export async function uploadUserTexturePhoto(
  viewerId: string,
  modelId: string,
  textureId: string,
  file: File
): Promise<string> {
  const fileName = `${viewerId}/${modelId}/${textureId}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.USER_TEXTURE_PHOTOS)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });
  
  if (error) {
    throw new Error(`Failed to upload texture photo: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKETS.USER_TEXTURE_PHOTOS)
    .getPublicUrl(data.path);
  
  return urlData.publicUrl;
}

/**
 * Upload a processed/corrected texture to processed-textures bucket
 * Always saves as WebP format for better compression
 */
export async function uploadProcessedTexture(
  viewerId: string,
  modelId: string,
  textureId: string,
  buffer: Buffer
): Promise<string> {
  // Always use .webp extension for processed textures
  const fileName = `${viewerId}/${modelId}/${textureId}.webp`;
  
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.PROCESSED_TEXTURES)
    .upload(fileName, buffer, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) {
    throw new Error(`Failed to upload processed texture: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKETS.PROCESSED_TEXTURES)
    .getPublicUrl(data.path);
  
  return urlData.publicUrl;
}

/**
 * Upload a processed texture from a File object to processed-textures bucket
 * Supports WebP format for better compression, with PNG fallback
 */
export async function uploadProcessedTextureFile(
  viewerId: string,
  modelId: string,
  textureId: string,
  file: File
): Promise<string> {
  // Determine file extension based on file type
  const extension = file.type === 'image/webp' ? 'webp' : 'png';
  const fileName = `${viewerId}/${modelId}/${textureId}.${extension}`;
  
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.PROCESSED_TEXTURES)
    .upload(fileName, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) {
    // If WebP is not allowed, provide helpful error message
    if (error.message.includes('mime type') && file.type === 'image/webp') {
      throw new Error(`Failed to upload processed texture: ${error.message}. Run migration: pnpm supabase db push`);
    }
    throw new Error(`Failed to upload processed texture: ${error.message}`);
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKETS.PROCESSED_TEXTURES)
    .getPublicUrl(data.path);
  
  return urlData.publicUrl;
}

/**
 * Delete a 3D model file from storage
 */
export async function delete3DModel(filePath: string, supabaseClient?: any): Promise<void> {
  const client = supabaseClient || supabase;
  const { error } = await client.storage
    .from(STORAGE_BUCKETS.MODELS_3D)
    .remove([filePath]);
  
  if (error) {
    throw new Error(`Failed to delete 3D model: ${error.message}`);
  }
}

/**
 * Move a file to deleted-images bucket before deletion
 */
export async function moveToDeletedImages(
  sourceUrl: string,
  sourceBucket: string,
  textureId: string,
  supabaseClient?: any
): Promise<void> {
  const client = supabaseClient || supabase;
  
  try {
    // Get the file path from URL
    const filePath = getFilePathFromUrl(sourceUrl, sourceBucket);
    
    // Download the file from source bucket
    const { data: fileData, error: downloadError } = await client.storage
      .from(sourceBucket)
      .download(filePath);
    
    if (downloadError || !fileData) {
      console.warn('Could not download file for archiving:', downloadError);
      return;
    }
    
    // Upload to deleted-images bucket with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${textureId}_${filePath.split('/').pop()}`;
    const deletedPath = `${filePath.split('/').slice(0, -1).join('/')}/${fileName}`;
    
    await client.storage
      .from(STORAGE_BUCKETS.DELETED_IMAGES)
      .upload(deletedPath, fileData, {
        cacheControl: '3600',
        upsert: true
      });
  } catch (error) {
    console.warn('Failed to archive file to deleted-images:', error);
    // Don't throw - archiving is optional, deletion should proceed
  }
}

/**
 * Delete texture files for a model (moves to deleted-images first)
 */
export async function deleteModelTextures(
  viewerId: string,
  modelId: string,
  supabaseClient?: any
): Promise<void> {
  const client = supabaseClient || supabase;
  
  // Delete from all texture-related buckets
  const buckets = [
    STORAGE_BUCKETS.TEXTURE_TEMPLATES,
    STORAGE_BUCKETS.USER_TEXTURE_PHOTOS,
    STORAGE_BUCKETS.PROCESSED_TEXTURES
  ];
  
  for (const bucket of buckets) {
    const { data: files } = await client.storage
      .from(bucket)
      .list(`${viewerId}/${modelId}`);
    
    if (files && files.length > 0) {
      // Move each file to deleted-images before deleting
      for (const file of files) {
        const filePath = `${viewerId}/${modelId}/${file.name}`;
        const { data: urlData } = client.storage.from(bucket).getPublicUrl(filePath);
        await moveToDeletedImages(urlData.publicUrl, bucket, file.name, client);
      }
      
      // Delete files from source bucket
      const filePaths = files.map((file: any) => `${viewerId}/${modelId}/${file.name}`);
      await client.storage.from(bucket).remove(filePaths);
    }
  }
}

/**
 * Delete a single texture (moves to deleted-images first)
 */
export async function deleteTexture(
  textureId: string,
  originalPhotoUrl: string,
  correctedTextureUrl: string,
  supabaseClient?: any
): Promise<void> {
  const client = supabaseClient || supabase;
  
  // Move original photo to deleted-images
  if (originalPhotoUrl) {
    const originalPath = getFilePathFromUrl(originalPhotoUrl, STORAGE_BUCKETS.USER_TEXTURE_PHOTOS);
    await moveToDeletedImages(originalPhotoUrl, STORAGE_BUCKETS.USER_TEXTURE_PHOTOS, textureId, client);
    await client.storage.from(STORAGE_BUCKETS.USER_TEXTURE_PHOTOS).remove([originalPath]);
  }
  
  // Move processed texture to deleted-images
  if (correctedTextureUrl) {
    const processedPath = getFilePathFromUrl(correctedTextureUrl, STORAGE_BUCKETS.PROCESSED_TEXTURES);
    await moveToDeletedImages(correctedTextureUrl, STORAGE_BUCKETS.PROCESSED_TEXTURES, textureId, client);
    await client.storage.from(STORAGE_BUCKETS.PROCESSED_TEXTURES).remove([processedPath]);
  }
}

/**
 * Get file path from public URL
 */
export function getFilePathFromUrl(url: string, bucket: string): string {
  const bucketPrefix = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(bucketPrefix);
  
  if (index === -1) {
    throw new Error('Invalid storage URL');
  }
  
  return url.substring(index + bucketPrefix.length);
}

/**
 * Validate file type for 3D models
 */
export function isValid3DModelFile(file: File): boolean {
  const validExtensions = ['.glb', '.gltf', '.obj', '.fbx'];
  const validMimeTypes = [
    'model/gltf-binary',
    'model/gltf+json',
    'application/octet-stream',
    'text/plain'
  ];
  
  const fileName = file.name.toLowerCase();
  const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
  const hasValidMimeType = validMimeTypes.includes(file.type);
  
  return hasValidExtension || hasValidMimeType;
}

/**
 * Validate file type for images
 */
export function isValidImageFile(file: File): boolean {
  const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validMimeTypes.includes(file.type);
}

/**
 * Validate file size
 */
export function isValidFileSize(file: File, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}
