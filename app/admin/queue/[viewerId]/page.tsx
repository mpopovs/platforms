import { notFound } from 'next/navigation';
import { getViewerConfig } from '@/lib/viewers';
import { createClient } from '@/lib/supabase/server';
import { QueueControl } from './queue-control';

export default async function QueueControlPage({
  params
}: {
  params: Promise<{ viewerId: string }>;
}) {
  const { viewerId } = await params;
  const supabase = await createClient();

  // Get viewer
  const viewer = await getViewerConfig(viewerId, supabase);
  if (!viewer) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Queue Control: {viewer.name}
          </h1>
          <QueueControl viewerId={viewerId} />
        </div>
      </div>
    </div>
  );
}
