import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId');
    const ageGroup = searchParams.get('ageGroup');
    const language = searchParams.get('language') || 'en';

    if (!viewerId || !ageGroup) {
      return NextResponse.json(
        { error: 'Missing viewerId or ageGroup' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const [{ data: questions, error }, { data: viewer }] = await Promise.all([
      supabase
        .from('survey_questions')
        .select('*')
        .eq('viewer_id', viewerId)
        .eq('age_group', parseInt(ageGroup))
        .eq('is_active', true)
        .order('order_index', { ascending: true }),
      supabase
        .from('viewers')
        .select('settings')
        .eq('id', viewerId)
        .single(),
    ]);

    if (error) {
      console.error('Error fetching questions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch questions' },
        { status: 500 }
      );
    }

    // Resolve viewer-level research purpose in the requested language
    const s = (viewer?.settings as any) ?? {};
    const research_purpose =
      s.research_purpose_translations?.[language] ||
      s.research_purpose_translations?.['en'] ||
      s.research_purpose ||
      '';

    // Apply language translation: use question_translations[language] if available,
    // fallback to question_translations['en'], fallback to question_text
    const localised = (questions || []).map((q: any) => ({
      ...q,
      question_text:
        q.question_translations?.[language] ||
        q.question_translations?.['en'] ||
        q.question_text,
    }));

    return NextResponse.json({ questions: localised, research_purpose });
  } catch (error) {
    console.error('Survey questions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
