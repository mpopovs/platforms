import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { textureId, ageGroup, surveyCompleted } = body;

    if (!textureId || !ageGroup) {
      return NextResponse.json(
        { error: 'Missing textureId or ageGroup' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('model_textures')
      .update({ 
        age_group: ageGroup,
        survey_completed: surveyCompleted ?? false
      })
      .eq('id', textureId);

    if (error) {
      console.error('Error updating texture:', error);
      return NextResponse.json(
        { error: 'Failed to update texture' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update texture error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
