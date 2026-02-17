import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId');
    const ageGroupParam = searchParams.get('ageGroup');

    if (!viewerId) {
      return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });
    }

    // Verify user owns the viewer
    const { data: viewer } = await supabase
      .from('viewers')
      .select('user_id')
      .eq('id', viewerId)
      .single();

    if (!viewer || viewer.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build query for responses
    let responsesQuery = supabase
      .from('survey_responses')
      .select(`
        *,
        survey_questions!inner(question_text, question_type, viewer_id)
      `)
      .eq('survey_questions.viewer_id', viewerId);

    if (ageGroupParam) {
      responsesQuery = responsesQuery.eq('age_group', parseInt(ageGroupParam));
    }

    const { data: responses, error } = await responsesQuery;

    if (error) {
      console.error('Error fetching responses:', error);
      return NextResponse.json(
        { error: 'Failed to fetch responses' },
        { status: 500 }
      );
    }

    // Calculate statistics per question
    const questionStats = new Map<string, any>();

    responses?.forEach((response: any) => {
      const questionId = response.question_id;
      const question = response.survey_questions;

      if (!questionStats.has(questionId)) {
        questionStats.set(questionId, {
          question_id: questionId,
          question_text: question.question_text,
          question_type: question.question_type,
          responses: 0,
          total: 0,
          distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        });
      }

      const stats = questionStats.get(questionId);
      stats.responses++;
      stats.total += response.response_value;
      stats.distribution[response.response_value.toString()]++;
    });

    // Calculate averages and format results
    const stats = Array.from(questionStats.values()).map((stat) => ({
      ...stat,
      average: stat.responses > 0 ? stat.total / stat.responses : 0,
    }));

    const totalResponses = responses?.length || 0;

    return NextResponse.json({ stats, totalResponses });
  } catch (error) {
    console.error('Admin survey results error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
