import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTextureId } from '@/lib/types/viewer';

// CORS headers for widget access from any domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * OPTIONS /api/widget/upload
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, { 
    status: 204,
    headers: corsHeaders 
  });
}

/**
 * POST /api/widget/upload
 * Upload original photo from widget (processed texture is stored client-side)
 * 
 * Body (FormData):
 * - file: The original photo file
 * - viewerId: The viewer ID
 * - modelId: The model ID
 * - authorName: (optional) Author name
 * - authorAge: (optional) Author age
 * - processedLocally: 'true' if texture was processed client-side
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const file = formData.get('file') as File;
    const viewerId = formData.get('viewerId') as string;
    const modelId = formData.get('modelId') as string;
    const authorName = formData.get('authorName') as string | null;
    const authorAge = formData.get('authorAge') as string | null;
    const processedLocally = formData.get('processedLocally') === 'true';

    if (!file || !viewerId || !modelId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, viewerId, modelId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = await createClient();

    // Verify viewer exists
    const { data: viewer, error: viewerError } = await supabase
      .from('viewers')
      .select('id, settings')
      .or(`id.eq.${viewerId},short_code.eq.${viewerId}`)
      .single();

    if (viewerError || !viewer) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Verify model exists and belongs to viewer
    const { data: model, error: modelError } = await supabase
      .from('viewer_models')
      .select('id, viewer_id')
      .or(`id.eq.${modelId},short_code.eq.${modelId}`)
      .single();

    if (modelError || !model || model.viewer_id !== viewer.id) {
      return NextResponse.json(
        { error: 'Model not found or does not belong to viewer' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Generate unique ID for this texture upload
    const textureId = generateTextureId();
    
    // Upload original photo to storage
    const fileBuffer = await file.arrayBuffer();
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const originalFileName = `${textureId}_original.${fileExtension}`;
    const originalFilePath = `original-photos/${viewer.id}/${model.id}/${originalFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('user-texture-photos')
      .upload(originalFilePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload original photo' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Get public URL for original photo
    const { data: { publicUrl: originalPhotoUrl } } = supabase.storage
      .from('user-texture-photos')
      .getPublicUrl(originalFilePath);

    // If processed locally, we don't have a server-side processed texture
    // The client will store the processed texture in IndexedDB
    // We still create a record to track the upload
    
    const textureRecord: any = {
      id: textureId,
      model_id: model.id,
      original_photo_url: originalPhotoUrl,
      // For local processing, corrected_texture_url points to placeholder or is set later
      corrected_texture_url: processedLocally ? 'local://indexeddb' : originalPhotoUrl,
      uploaded_at: new Date().toISOString(),
      processed_at: processedLocally ? new Date().toISOString() : null,
    };

    if (authorName) {
      textureRecord.author_name = authorName;
    }
    if (authorAge) {
      textureRecord.author_age = parseInt(authorAge, 10);
    }

    const { data: texture, error: textureError } = await supabase
      .from('model_textures')
      .insert(textureRecord)
      .select()
      .single();

    if (textureError) {
      console.error('Texture record error:', textureError);
      return NextResponse.json(
        { error: 'Failed to create texture record' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({
      success: true,
      textureId: texture.id,
      originalPhotoUrl,
      processedLocally,
      message: processedLocally 
        ? 'Original photo uploaded. Processed texture stored locally on device.'
        : 'Photo uploaded successfully.'
    }, { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Widget upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
