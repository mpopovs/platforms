import { getAllViewersAction, getViewerModelsWithTexturesAction } from '@/app/actions';
import { ViewersManagement } from './viewers-management';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `Viewer Management | ${rootDomain}`,
  description: 'Manage your viewers'
};

export default async function ViewersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const viewers = await getAllViewersAction();
  
  // Fetch models for each viewer
  const viewersWithModels = await Promise.all(
    viewers.map(async (viewer) => {
      const models = await getViewerModelsWithTexturesAction(viewer.id);
      return {
        ...viewer,
        models
      };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ViewersManagement initialViewers={viewersWithModels} />
    </div>
  );
}
