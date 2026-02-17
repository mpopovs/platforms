import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { textureId, ageGroup, responses } = body;

    if (!textureId || !ageGroup || !responses || !Array.isArray(responses)) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Insert all responses
    const responseRecords = responses.map((response) => ({
      texture_id: textureId,
      question_id: response.questionId,
      age_group: ageGroup,
      response_value: response.value,
    }));

    const { error: insertError } = await supabase
      .from('survey_responses')
      .insert(responseRecords);

    if (insertError) {
      console.error('Error inserting responses:', insertError);
      return NextResponse.json(
        { error: 'Failed to save responses' },
        { status: 500 }
      );
    }

    // Update texture with survey completion
    const { error: updateError } = await supabase
      .from('model_textures')
      .update({ 
        age_group: ageGroup,
        survey_completed: true 
      })
      .eq('id', textureId);

    if (updateError) {
      console.error('Error updating texture:', updateError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Survey responses error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
