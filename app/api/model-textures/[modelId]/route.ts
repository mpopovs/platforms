import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/model-textures/[modelId]
 * Get all textures for a specific model
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const supabase = await createClient();
    const { modelId } = await params;

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user owns this model's viewer
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

    if ((model.viewers as any).user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch all textures for this model
    // Optional: filter textures to a specific classroom viewer's uploads
    const { searchParams } = new URL(request.url);
    const viewerIdFilter = searchParams.get('viewerId');

    let texturesQuery = supabase
      .from('model_textures')
      .select('*')
      .eq('model_id', modelId);

    if (viewerIdFilter) {
      texturesQuery = texturesQuery.eq('upload_source_viewer_id', viewerIdFilter);
    }

    const { data: textures, error: texturesError } = await texturesQuery
      .order('uploaded_at', { ascending: false });

    if (texturesError) {
      throw texturesError;
    }

    // Attach each texture's queue number (the #555 shown on the viewer).
    // IDs are queried in batches: a model can have hundreds of textures, and
    // one request with all IDs exceeds the URL length limit (HTTP 414).
    const queueNumbers = new Map<string, number>();
    const textureIds = (textures || []).map((t) => t.id);
    const BATCH_SIZE = 100;
    const batches: string[][] = [];
    for (let i = 0; i < textureIds.length; i += BATCH_SIZE) {
      batches.push(textureIds.slice(i, i + BATCH_SIZE));
    }
    const batchResults = await Promise.all(
      batches.map((ids) =>
        supabase
          .from('texture_queue')
          .select('texture_id, queue_number')
          .in('texture_id', ids)
      )
    );
    for (const { data: queueRows, error: queueError } of batchResults) {
      if (queueError) {
        console.warn('Failed to fetch texture queue numbers:', queueError);
      }
      for (const row of queueRows || []) {
        queueNumbers.set(row.texture_id, row.queue_number);
      }
    }

    return NextResponse.json({
      success: true,
      textures: (textures || []).map((t) => ({ ...t, queue_number: queueNumbers.get(t.id) ?? null })),
      count: textures?.length || 0
    });

  } catch (error: any) {
    console.error('Error fetching model textures:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch textures',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/model-textures/[modelId]?textureId=xxx
 * Delete a specific texture
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const supabase = await createClient();
    const { modelId } = await params;
    const { searchParams } = new URL(request.url);
    const textureId = searchParams.get('textureId');

    if (!modelId || !textureId) {
      return NextResponse.json(
        { error: 'Model ID and Texture ID are required' },
        { status: 400 }
      );
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user owns this model's viewer
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

    if ((model.viewers as any).user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete the texture from database
    const { error: deleteError } = await supabase
      .from('model_textures')
      .delete()
      .eq('id', textureId)
      .eq('model_id', modelId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: 'Texture deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting texture:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete texture',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
