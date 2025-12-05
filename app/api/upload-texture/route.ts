import { NextRequest, NextResponse } from 'next/server';
import { getViewerModel } from '@/lib/viewers';
import { uploadUserTexturePhoto } from '@/lib/storage';
import { generateTextureId } from '@/lib/types/viewer';

/**
 * POST /api/upload-texture
 * Public endpoint for uploading texture photos
 * No authentication required - viewerId/modelId from URL parameters
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo') as File;
    const originalFile = formData.get('originalPhoto') as File | null;

    // Get viewerId, modelId, and author info from form data (passed from upload form)
    const viewerId = formData.get('viewerId') as string;
    const modelId = formData.get('modelId') as string;
    const authorName = formData.get('authorName') as string;
    const authorAge = formData.get('authorAge') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'Photo file is required' },
        { status: 400 }
      );
    }

    if (!viewerId || !modelId) {
      return NextResponse.json(
        { error: 'Viewer ID and Model ID are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Validate original file if provided
    if (originalFile && !originalFile.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Original file must be an image' },
        { status: 400 }
      );
    }

    if (originalFile && originalFile.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Original file size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Verify viewer and model exist
    const model = await getViewerModel(modelId);

    if (!model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    if (model.viewer_id !== viewerId) {
      return NextResponse.json(
        { error: 'Invalid model for this viewer' },
        { status: 400 }
      );
    }

    // Check if image was already processed client-side with ArUco markers
    const clientProcessed = formData.get('clientProcessed') === 'true';

    // Generate texture ID
    const textureId = generateTextureId();

    if (clientProcessed) {
      // Image already cropped by ArUco markers client-side
      // We have both the cropped image (file) and original uncropped image (originalFile)

      // Upload original uncropped photo to user-texture-photos bucket
      const originalPhotoUrl = originalFile
        ? await uploadUserTexturePhoto(viewerId, modelId, `${textureId}_original`, originalFile)
        : await uploadUserTexturePhoto(viewerId, modelId, textureId, file);

      // Upload processed/cropped texture to processed-textures bucket
      const { uploadProcessedTextureFile } = await import('@/lib/storage');
      let processedTextureUrl: string;
      
      try {
        processedTextureUrl = await uploadProcessedTextureFile(
          viewerId,
          modelId,
          textureId,
          file
        );
      } catch (error: any) {
        // Fallback: If WebP is not supported yet, convert to PNG
        if (error.message.includes('mime type') && file.type === 'image/webp') {
          console.warn('WebP not supported, converting to PNG...');
          
          // Convert WebP to PNG
          const arrayBuffer = await file.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: 'image/png' });
          const pngFile = new File([blob], file.name.replace('.webp', '.png'), { type: 'image/png' });
          
          processedTextureUrl = await uploadProcessedTextureFile(
            viewerId,
            modelId,
            textureId,
            pngFile
          );
        } else {
          throw error;
        }
      }

      // Create texture record directly (no further processing needed)
      const { createModelTexture } = await import('@/lib/viewers');
      await createModelTexture(
        textureId,
        modelId,
        originalPhotoUrl,
        processedTextureUrl,
        authorName,
        authorAge ? parseInt(authorAge, 10) : undefined
      );

      return NextResponse.json(
        {
          success: true,
          textureId,
          viewerId,
          modelId,
          originalPhotoUrl,
          correctedTextureUrl: processedTextureUrl,
          message: 'Texture uploaded and processed with ArUco markers successfully!'
        },
        { status: 200 }
      );
    } else {
      // Upload photo to storage (original unprocessed)
      const photoUrl = await uploadUserTexturePhoto(
        viewerId,
        modelId,
        textureId,
        file
      );
      // No client-side processing - trigger server-side processing
      fetch(`${request.nextUrl.origin}/api/process-texture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textureId,
          viewerId,
          modelId,
          originalPhotoUrl: photoUrl,
          clientProcessed: false,
          authorName,
          authorAge: authorAge ? parseInt(authorAge, 10) : undefined
        })
      }).catch(err => console.error('Error triggering texture processing:', err));

      return NextResponse.json(
        {
          success: true,
          textureId,
          viewerId,
          modelId,
          originalPhotoUrl: photoUrl,
          message: 'Texture uploaded successfully. Processing in progress...'
        },
        { status: 200 }
      );
    }

  } catch (error: any) {
    console.error('Error uploading texture:', error);
    return NextResponse.json(
      { 
        error: 'Failed to upload texture',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

