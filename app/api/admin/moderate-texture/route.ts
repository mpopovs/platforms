import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/admin/moderate-texture
 * Approve or reject a texture. Requires the authenticated user to own the viewer
 * that the texture belongs to.
 *
 * Body: { textureId: string; status: 'approved' | 'rejected' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Require authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { textureId, status } = body as { textureId: string; status: string };

    if (!textureId || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'textureId and status ("approved" or "rejected") are required' },
        { status: 400 }
      );
    }

    // Verify ownership: the texture's model must belong to a viewer owned by this user
    const { data: texture, error: texErr } = await supabase
      .from('model_textures')
      .select('id, model_id, moderation_status, viewer_models!inner(viewer_id, viewers!inner(user_id))')
      .eq('id', textureId)
      .single();

    if (texErr || !texture) {
      return NextResponse.json({ error: 'Texture not found' }, { status: 404 });
    }

    const viewerModel = (texture as any).viewer_models;
    const viewer = viewerModel?.viewers;
    if (viewer?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update moderation status
    const { error: updateError } = await supabase
      .from('model_textures')
      .update({ moderation_status: status })
      .eq('id', textureId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      textureId,
      status,
      message: status === 'approved'
        ? 'Texture approved and will now appear in the viewer.'
        : 'Texture rejected and will not appear in the viewer.'
    });

  } catch (error: any) {
    console.error('Error moderating texture:', error);
    return NextResponse.json(
      { error: 'Failed to update moderation status', details: error.message },
      { status: 500 }
    );
  }
}
