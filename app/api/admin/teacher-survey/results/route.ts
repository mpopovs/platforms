import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const viewerId = request.nextUrl.searchParams.get('viewerId');
    if (!viewerId) return NextResponse.json({ error: 'Missing viewerId' }, { status: 400 });

    // Verify user owns this viewer
    const { data: viewer } = await supabase
      .from('viewers')
      .select('id, user_id, settings')
      .eq('id', viewerId)
      .single();
    if (!viewer || viewer.user_id !== user.id)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Get survey definition from parent viewer's settings
    const survey = viewer.settings?.worksheetLayout?.klaseInstructionPage?.teacherSurvey;
    if (!survey?.enabled || !survey.questions?.length)
      return NextResponse.json({ questions: [], totalResponses: 0, classrooms: [] });

    // Get all classroom viewer IDs registered under this parent
    const { data: registrations } = await supabase
      .from('classroom_registrations')
      .select('viewer_id, school_name, teacher_name, created_at')
      .eq('parent_viewer_id', viewerId)
      .order('created_at', { ascending: false });

    const classroomViewerIds = (registrations ?? []).map(r => r.viewer_id);

    // Also include direct responses on the parent viewer itself
    const allViewerIds = [viewerId, ...classroomViewerIds];

    // Fetch all teacher survey responses
    const { data: rawResponses } = await supabase
      .from('teacher_survey_responses')
      .select('id, viewer_id, pin, lang, answers, created_at')
      .in('viewer_id', allViewerIds)
      .order('created_at', { ascending: false });

    const responses = rawResponses ?? [];

    // Build a map: viewerId → school_name for display
    const schoolMap: Record<string, string> = {};
    for (const r of registrations ?? []) {
      schoolMap[r.viewer_id] = r.school_name ?? r.viewer_id;
    }

    // Aggregate stats per question
    const questionStats = survey.questions.map((q: any) => {
      const allAnswers: Array<{ responseId: string; value: string | string[]; school: string; lang: string; date: string }> = [];
      const optionCounts: Record<string, number> = {};

      for (const resp of responses) {
        const ans = (resp.answers as Array<{ question_id: string; value: string | string[] }>)
          .find(a => a.question_id === q.id);
        if (!ans) continue;

        allAnswers.push({
          responseId: resp.id,
          value: ans.value,
          school: schoolMap[resp.viewer_id] ?? resp.viewer_id,
          lang: resp.lang,
          date: resp.created_at,
        });

        if (q.type === 'checkbox') {
          const vals = Array.isArray(ans.value) ? ans.value : [ans.value];
          for (const v of vals) {
            optionCounts[v] = (optionCounts[v] ?? 0) + 1;
          }
        } else if (q.type === 'likert') {
          const v = String(ans.value);
          optionCounts[v] = (optionCounts[v] ?? 0) + 1;
        }
      }

      return {
        id: q.id,
        type: q.type,
        text: q.text,
        options: q.options,
        totalAnswered: allAnswers.length,
        optionCounts,
        textAnswers: q.type !== 'checkbox' && q.type !== 'likert' ? allAnswers : [],
      };
    });

    return NextResponse.json({
      questions: questionStats,
      totalResponses: responses.length,
      classrooms: (registrations ?? []).map(r => ({
        viewerId: r.viewer_id,
        schoolName: r.school_name,
        teacherName: r.teacher_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[admin/teacher-survey/results]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
