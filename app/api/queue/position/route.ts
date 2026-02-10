import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/queue/position?queueNumber=xxx&viewerId=xxx
 * Get position in queue for a specific queue number
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const queueNumber = searchParams.get('queueNumber');
  const viewerId = searchParams.get('viewerId');

  if (!queueNumber || !viewerId) {
    return NextResponse.json(
      { error: 'queueNumber and viewerId are required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get all waiting and displaying entries for this viewer
  const { data, error } = await supabase
    .from('texture_queue')
    .select('queue_number, status')
    .eq('viewer_id', viewerId)
    .in('status', ['waiting', 'displaying'])
    .order('queue_number', { ascending: true });

  if (error) {
    console.error('Error fetching queue position:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue position' },
      { status: 500 }
    );
  }

  const myIndex = data.findIndex(item => item.queue_number === parseInt(queueNumber));
  
  if (myIndex === -1) {
    return NextResponse.json({
      position: 0,
      status: 'completed',
      estimatedWait: 0
    });
  }

  const position = myIndex + 1;
  const estimatedWait = position > 1 ? (position - 1) * 60 : 0;

  return NextResponse.json({
    position,
    status: data[myIndex].status,
    estimatedWait,
    totalInQueue: data.length
  });
}
