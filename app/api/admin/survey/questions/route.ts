import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch questions for a viewer and age group
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const viewerId = searchParams.get('viewerId');
    const ageGroup = searchParams.get('ageGroup');

    if (!viewerId || !ageGroup) {
      return NextResponse.json(
        { error: 'Missing viewerId or ageGroup' },
        { status: 400 }
      );
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

    const { data: questions, error } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('viewer_id', viewerId)
      .eq('age_group', parseInt(ageGroup))
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
    console.error('Admin survey questions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save questions for a viewer and age group
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { viewerId, ageGroup, questions } = body;

    if (!viewerId || !ageGroup || !questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
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

    // Delete existing questions for this viewer and age group
    const { error: deleteError } = await supabase
      .from('survey_questions')
      .delete()
      .eq('viewer_id', viewerId)
      .eq('age_group', ageGroup);

    if (deleteError) {
      console.error('Error deleting old questions:', deleteError);
      return NextResponse.json(
        { error: 'Failed to update questions' },
        { status: 500 }
      );
    }

    // Insert new questions
    if (questions.length > 0) {
      const questionRecords = questions.map((q: any, index: number) => ({
        viewer_id: viewerId,
        age_group: ageGroup,
        question_text: q.question_text,
        question_type: q.question_type,
        order_index: index,
        is_active: q.is_active ?? true,
      }));

      const { error: insertError } = await supabase
        .from('survey_questions')
        .insert(questionRecords);

      if (insertError) {
        console.error('Error inserting questions:', insertError);
        return NextResponse.json(
          { error: 'Failed to save questions' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin survey questions save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
