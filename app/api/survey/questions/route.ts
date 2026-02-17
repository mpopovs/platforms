import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId');
    const ageGroup = searchParams.get('ageGroup');

    if (!viewerId || !ageGroup) {
      return NextResponse.json(
        { error: 'Missing viewerId or ageGroup' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: questions, error } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('viewer_id', viewerId)
      .eq('age_group', parseInt(ageGroup))
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch questions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions: questions || [] });
  } catch (error) {
    console.error('Survey questions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
