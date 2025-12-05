import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> }
) {
  try {
    const { viewerId } = await params;
    const supabase = await createClient();
    
    const { data: viewer, error } = await supabase
      .from('viewers')
      .select('*')
      .eq('id', viewerId)
      .single();

    if (error) {
      console.error('Error fetching viewer:', error);
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 });
    }

    return NextResponse.json(viewer);
  } catch (error) {
    console.error('Error in viewer API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
