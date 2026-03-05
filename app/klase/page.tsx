import { createClient } from '@supabase/supabase-js';
import { KlaseFlow } from './klase-flow';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Klases reģistrācija | Claypixel',
  description: 'Reģistrējiet savu klasi un iegūstiet darba lapas 3D modelēšanas nodarbībai.',
};

export const dynamic = 'force-dynamic';

type ParentViewer = {
  id: string;
  name: string;
};

async function getParentViewers(): Promise<ParentViewer[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('viewers')
    .select('id, name, settings')
    .is('parent_viewer_id', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Only expose viewers where the admin has enabled classroom registrations
  return (data as any[]).filter((v) => v.settings?.classroomEnabled === true).map((v) => ({ id: v.id, name: v.name }));
}

export default async function KlasePage() {
  const parentViewers = await getParentViewers();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Klases reģistrācija</h1>
          <p className="text-gray-600">
            Reģistrējiet savu klasi, lai iegūtu darba lapas.
          </p>
        </div>
        <KlaseFlow parentViewers={parentViewers} />
      </div>
    </div>
  );
}
