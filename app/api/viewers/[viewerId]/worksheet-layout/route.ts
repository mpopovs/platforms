import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WorksheetLayout } from '@/lib/types/viewer';

/**
 * GET /api/viewers/[viewerId]/worksheet-layout
 * Returns the viewer's current worksheet layout (or null).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> }
) {
  try {
    const { viewerId } = await params;
    const supabase = await createClient();

    const { data: viewer, error } = await supabase
      .from('viewers')
      .select('settings')
      .eq('id', viewerId)
      .single();

    if (error || !viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 });
    }

    const layout: WorksheetLayout | null = viewer.settings?.worksheetLayout ?? null;
    return NextResponse.json({ layout });
  } catch (err) {
    console.error('[worksheet-layout GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/viewers/[viewerId]/worksheet-layout
 * Saves (or clears) the worksheet layout for a viewer.
 * Body: { layout: WorksheetLayout | null }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> }
) {
  try {
    const { viewerId } = await params;
    const body = await request.json();
    const layout: WorksheetLayout | null = body.layout ?? null;

    const supabase = await createClient();

    // Load current settings
    const { data: viewer, error: fetchError } = await supabase
      .from('viewers')
      .select('settings')
      .eq('id', viewerId)
      .single();

    if (fetchError || !viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 });
    }

    const newSettings = { ...(viewer.settings ?? {}), worksheetLayout: layout ?? undefined };
    if (layout === null) delete newSettings.worksheetLayout;

    const { error: updateError } = await supabase
      .from('viewers')
      .update({ settings: newSettings })
      .eq('id', viewerId);

    if (updateError) {
      console.error('[worksheet-layout PUT]', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, layout });
  } catch (err) {
    console.error('[worksheet-layout PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
