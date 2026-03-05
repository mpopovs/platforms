import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getViewerConfig, getViewerConfigByShortCode } from '@/lib/viewers';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Resolve a viewer by ID or short code */
async function resolveViewer(idOrCode: string) {
  const supabase = serviceClient();
  const byId = await getViewerConfig(idOrCode, supabase);
  if (byId) return byId;
  return getViewerConfigByShortCode(idOrCode, supabase);
}

/** GET /api/teacher-survey/[viewerId] — fetch the survey definition for a viewer */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> },
) {
  const { viewerId } = await params;
  const config = await resolveViewer(viewerId);
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const survey = config.settings?.worksheetLayout?.klaseInstructionPage?.teacherSurvey;
  if (!survey?.enabled) {
    return NextResponse.json({ error: 'Survey not enabled' }, { status: 404 });
  }

  return NextResponse.json({ survey, viewerId: config.id });
}

/** POST /api/teacher-survey/[viewerId] — submit a survey response */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> },
) {
  const { viewerId } = await params;
  const body = await req.json();
  const { answers, pin, lang } = body;

  if (!answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers array required' }, { status: 400 });
  }

  const config = await resolveViewer(viewerId);
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const survey = config.settings?.worksheetLayout?.klaseInstructionPage?.teacherSurvey;
  if (!survey?.enabled) return NextResponse.json({ error: 'Survey not enabled' }, { status: 404 });

  const supabase = serviceClient();
  const { error } = await supabase.from('teacher_survey_responses').insert({
    viewer_id: config.id,
    pin: pin || null,
    lang: lang || 'en',
    answers,
  });

  if (error) {
    console.error('[teacher-survey] insert error:', error);
    return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
