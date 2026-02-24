import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/admin/survey/research-purpose?viewerId=xxx
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const viewerId = request.nextUrl.searchParams.get('viewerId');
    if (!viewerId) return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });

    const { data: viewer, error } = await supabase
      .from('viewers')
      .select('user_id, settings')
      .eq('id', viewerId)
      .single();

    if (error || !viewer) return NextResponse.json({ error: 'Viewer not found' }, { status: 404 });
    if (viewer.user_id !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const s = (viewer.settings as any) ?? {};
    return NextResponse.json({
      research_purpose: s.research_purpose ?? '',
      research_purpose_translations: s.research_purpose_translations ?? {},
    });
  } catch (err) {
    console.error('GET research-purpose error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/survey/research-purpose
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { viewerId, research_purpose, research_purpose_translations } = await request.json();
    if (!viewerId) return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });

    const { data: viewer, error: fetchError } = await supabase
      .from('viewers')
      .select('user_id, settings')
      .eq('id', viewerId)
      .single();

    if (fetchError || !viewer) return NextResponse.json({ error: 'Viewer not found' }, { status: 404 });
    if (viewer.user_id !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const updatedSettings = {
      ...(viewer.settings as object ?? {}),
      research_purpose: research_purpose ?? '',
      research_purpose_translations: research_purpose_translations ?? {},
    };

    const { error: updateError } = await supabase
      .from('viewers')
      .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
      .eq('id', viewerId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH research-purpose error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
