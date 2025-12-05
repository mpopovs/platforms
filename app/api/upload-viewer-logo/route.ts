import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const formData = await request.formData();
    
    const viewerId = formData.get('viewerId') as string;
    const file = formData.get('file') as File;

    if (!viewerId || !file) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upload to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${viewerId}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('viewer-logos')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading logo:', uploadError);
      return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('viewer-logos')
      .getPublicUrl(filePath);

    const logoUrl = urlData.publicUrl;

    // Update viewer with logo URL
    const { error: updateError } = await supabase
      .from('viewers')
      .update({ logo_url: logoUrl })
      .eq('id', viewerId);

    if (updateError) {
      console.error('Error updating viewer:', updateError);
      return NextResponse.json({ error: 'Failed to update viewer' }, { status: 500 });
    }

    return NextResponse.json({ success: true, logoUrl });
  } catch (error) {
    console.error('Error in upload-viewer-logo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
