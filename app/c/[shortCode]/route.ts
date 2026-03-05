import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { getViewerConfigByShortCode } from '@/lib/viewers';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /c/[shortCode]
 * Short classroom upload URL — redirects to /upload/[classroomViewerId]
 * Printed on worksheets so teachers/students have a human-typeable URL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;

  try {
    const supabase = await createClient();
    const config = await getViewerConfigByShortCode(shortCode, supabase);

    if (!config) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
    }

    return redirect(`/upload/${config.id}`);
  } catch (error: any) {
    if (error.message === 'NEXT_REDIRECT') throw error;
    return NextResponse.json({ error: 'Failed to resolve link' }, { status: 500 });
  }
}
