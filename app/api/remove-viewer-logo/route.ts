import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { viewerId } = await request.json();

    if (!viewerId) {
      return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });
    }

    // Get current logo URL to delete from storage
    const { data: viewer } = await supabase
      .from('viewers')
      .select('logo_url')
      .eq('id', viewerId)
      .single();

    // Update viewer to remove logo URL
    const { error: updateError } = await supabase
      .from('viewers')
      .update({ logo_url: null })
      .eq('id', viewerId);

    if (updateError) {
      console.error('Error updating viewer:', updateError);
      return NextResponse.json({ error: 'Failed to update viewer' }, { status: 500 });
    }

    // Optionally delete the file from storage
    if (viewer?.logo_url) {
      try {
        const urlParts = viewer.logo_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        await supabase.storage
          .from('viewer-logos')
          .remove([fileName]);
      } catch (error) {
        console.error('Error deleting logo file:', error);
        // Continue even if file deletion fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in remove-viewer-logo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
