import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SurveyResultsViewer } from './survey-results-viewer';

export default async function AdminSurveyResultsPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  // Fetch user's viewers
  const { data: viewers } = await supabase
    .from('viewers')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Survey Results</h1>
        <p className="text-gray-600">
          View and analyze survey responses from users across different age groups.
        </p>
      </div>

      <SurveyResultsViewer viewers={viewers || []} userId={user.id} />
    </div>
  );
}
