import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/upload-uv-map
 * Upload UV map image for a model
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const modelId = formData.get('modelId') as string;
    const file = formData.get('file') as File;

    if (!modelId || !file) {
      return NextResponse.json(
        { error: 'Missing modelId or file' },
        { status: 400 }
      );
    }

    // Create authenticated Supabase client
    const supabase = await createClient();

    // Check user owns this model's viewer
    const { data: model, error: modelError } = await supabase
      .from('viewer_models')
      .select('viewer_id, viewers!inner(user_id)')
      .eq('id', modelId)
      .single();

    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (model.viewers as any).user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get user ID for file path
    const userId = (model.viewers as any).user_id;
    const viewerId = model.viewer_id;

    // Upload UV map to Supabase Storage (using texture-templates bucket)
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${viewerId}/${modelId}/uv-map.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('texture-templates')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload UV map' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('texture-templates')
      .getPublicUrl(fileName);

    // Update model with UV map URL
    const { error: updateError } = await supabase
      .from('viewer_models')
      .update({ uv_map_url: publicUrl })
      .eq('id', modelId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uvMapUrl: publicUrl
    });
  } catch (error: any) {
    console.error('Error uploading UV map:', error);
    return NextResponse.json(
      { error: 'Failed to upload UV map' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload-uv-map
 * Remove UV map from a model
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');

    if (!modelId) {
      return NextResponse.json(
        { error: 'Missing modelId' },
        { status: 400 }
      );
    }

    // Create authenticated Supabase client
    const supabase = await createClient();

    // Get model with current UV map URL
    const { data: model, error: modelError } = await supabase
      .from('viewer_models')
      .select('uv_map_url, viewer_id, viewers!inner(user_id)')
      .eq('id', modelId)
      .single();

    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (model.viewers as any).user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Delete file from storage if it exists
    if (model.uv_map_url) {
      try {
        const url = new URL(model.uv_map_url);
        const pathParts = url.pathname.split('/texture-templates/');
        if (pathParts.length > 1) {
          const filePath = pathParts[1];
          await supabase.storage
            .from('texture-templates')
            .remove([filePath]);
        }
      } catch (error) {
        console.error('Error deleting UV map file:', error);
        // Continue anyway to clear the URL from database
      }
    }

    // Update model to remove UV map URL
    const { error: updateError } = await supabase
      .from('viewer_models')
      .update({ uv_map_url: null })
      .eq('id', modelId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true
    });
  } catch (error: any) {
    console.error('Error removing UV map:', error);
    return NextResponse.json(
      { error: 'Failed to remove UV map' },
      { status: 500 }
    );
  }
}
