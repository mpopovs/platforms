import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/queue/current?viewerId=xxx
 * Get the current queue number being displayed
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const viewerId = searchParams.get('viewerId');

  if (!viewerId) {
    return NextResponse.json(
      { error: 'viewerId is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get the currently displaying entry
  const { data, error } = await supabase
    .from('texture_queue')
    .select('*')
    .eq('viewer_id', viewerId)
    .eq('status', 'displaying')
    .order('displayed_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "no rows returned" which is fine
    console.error('Error fetching current queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current queue' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    current: data?.queue_number || null,
    texture: data || null
  });
}

/**
 * POST /api/queue/current
 * Advance to next in queue
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { viewerId } = body;

  if (!viewerId) {
    return NextResponse.json(
      { error: 'viewerId is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Mark current as completed
  await supabase
    .from('texture_queue')
    .update({ 
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('viewer_id', viewerId)
    .eq('status', 'displaying');

  // Get next in queue
  const { data: nextEntry, error } = await supabase
    .from('texture_queue')
    .select('*')
    .eq('viewer_id', viewerId)
    .eq('status', 'waiting')
    .order('queue_number', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching next in queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next in queue' },
      { status: 500 }
    );
  }

  if (nextEntry) {
    // Mark as displaying
    await supabase
      .from('texture_queue')
      .update({ 
        status: 'displaying',
        displayed_at: new Date().toISOString()
      })
      .eq('id', nextEntry.id);

    return NextResponse.json({
      current: nextEntry.queue_number,
      texture: nextEntry
    });
  }

  return NextResponse.json({
    current: null,
    texture: null,
    message: 'Queue is empty'
  });
}
