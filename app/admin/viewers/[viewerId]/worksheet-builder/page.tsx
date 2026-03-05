import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import WorksheetBuilder from './worksheet-builder';

export default async function WorksheetBuilderPage({
  params,
}: {
  params: Promise<{ viewerId: string }>;
}) {
  const { viewerId } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Load viewer + models
  const { data: viewer, error: viewerError } = await supabase
    .from('viewers')
    .select('*')
    .eq('id', viewerId)
    .single();

  if (viewerError || !viewer) redirect('/admin');

  const { data: models } = await supabase
    .from('viewer_models')
    .select('id, name, uv_map_url, marker_id_base, order_index, qr_code_data')
    .eq('viewer_id', viewerId)
    .order('order_index', { ascending: true });

  return (
    <WorksheetBuilder
      viewer={viewer}
      models={models ?? []}
    />
  );
}
