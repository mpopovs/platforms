import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * GET /u/[shortCode]
 * Redirect short upload URLs to full upload page
 * Example: /u/abc123 → /upload/viewer_xxx/model_yyy
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  try {
    const { shortCode } = await params;

    if (!shortCode) {
      return NextResponse.json(
        { error: 'Short code is required' },
        { status: 400 }
      );
    }

    // Look up the model by short code
    const supabase = await createClient();
    const { data: model, error } = await supabase
      .from('viewer_models')
      .select('id, viewer_id, short_code')
      .eq('short_code', shortCode)
      .single();

    if (error || !model) {
      return NextResponse.json(
        { error: 'Invalid or expired link' },
        { status: 404 }
      );
    }

    // Redirect to full upload URL
    const uploadUrl = `/upload/${model.viewer_id}/${model.id}`;
    return redirect(uploadUrl);

  } catch (error: any) {
    // NEXT_REDIRECT is not an error - it's how Next.js handles redirects
    if (error.message === 'NEXT_REDIRECT') {
      throw error;
    }
    console.error('Error resolving short link:', error);
    return NextResponse.json(
      { error: 'Failed to resolve short link' },
      { status: 500 }
    );
  }
}
