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

    const filePath = `worksheet-images/${viewerId}/${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from('texture-templates')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('Error uploading worksheet image:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('texture-templates')
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error('Error in worksheet-image upload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
