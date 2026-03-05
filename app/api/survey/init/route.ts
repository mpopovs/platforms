import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/survey/init?viewerId=xxx&language=xxx
 *
 * Called once when the survey mounts. Returns:
 *  - questions grouped by age_group (all 3 groups, already localised)
 *  - research_purpose in the requested language
 *  - research_purpose_translations (all languages, so client-side language
 *    switching never needs another round-trip)
 *
 * 2 parallel DB queries instead of the previous 3 across 2 separate requests.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const viewerId = searchParams.get('viewerId');
    const language = searchParams.get('language') || 'en';

    if (!viewerId) {
      return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch all active questions for this viewer + viewer settings in parallel
    const [{ data: questions, error }, { data: viewer }] = await Promise.all([
      supabase
        .from('survey_questions')
        .select('*')
        .eq('viewer_id', viewerId)
        .eq('is_active', true)
        .order('age_group', { ascending: true })
        .order('order_index', { ascending: true }),
      supabase
        .from('viewers')
        .select('settings')
        .eq('id', viewerId)
        .single(),
    ]);

    if (error) {
      console.error('survey/init questions error:', error);
      return NextResponse.json({ error: 'Failed to fetch survey data' }, { status: 500 });
    }

    // Group and localise questions per age group
    const byAgeGroup: Record<number, any[]> = { 1: [], 2: [], 3: [] };
    for (const q of questions ?? []) {
      const localised = {
        ...q,
        question_text:
          q.question_translations?.[language] ||
          q.question_translations?.['en'] ||
          q.question_text,
      };
      if (byAgeGroup[q.age_group]) byAgeGroup[q.age_group].push(localised);
    }

    // Research purpose — return full translations map so language switches are
    // handled client-side without any additional fetch
    const s = (viewer?.settings as any) ?? {};
    const research_purpose_translations: Record<string, string> =
      s.research_purpose_translations ?? {};
    const research_purpose =
      research_purpose_translations[language] ||
      research_purpose_translations['en'] ||
      s.research_purpose ||
      '';

    return NextResponse.json({
      questionsByAgeGroup: byAgeGroup,
      research_purpose,
      research_purpose_translations,
    });
  } catch (err) {
    console.error('survey/init error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
