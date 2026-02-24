import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Public endpoint — returns the research purpose for a viewer in a given language
// GET /api/survey/research-purpose?viewerId=xxx&language=lv
export async function GET(request: NextRequest) {
  try {
    const viewerId = request.nextUrl.searchParams.get('viewerId');
    const language = request.nextUrl.searchParams.get('language') || 'en';

    if (!viewerId) {
      return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: viewer } = await supabase
      .from('viewers')
      .select('settings')
      .eq('id', viewerId)
      .single();

    const s = (viewer?.settings as any) ?? {};
    const research_purpose =
      s.research_purpose_translations?.[language] ||
      s.research_purpose_translations?.['en'] ||
      s.research_purpose ||
      '';

    return NextResponse.json({ research_purpose });
  } catch (err) {
    console.error('GET survey/research-purpose error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
