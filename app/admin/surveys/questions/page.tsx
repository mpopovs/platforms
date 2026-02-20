import { createClient } from '@/lib/supabase/server';
import { SurveyQuestionsManager } from './survey-questions-manager';

export default async function AdminSurveyQuestionsPage() {
  const supabase = await createClient();
  
  // Auth enforced by middleware — user is guaranteed to be present
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch user's viewers
  const { data: viewers } = await supabase
    .from('viewers')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Survey Questions</h1>
        <p className="text-gray-600">
          Manage survey questions for different age groups. Questions will be shown after texture upload.
        </p>
      </div>

      <SurveyQuestionsManager viewers={viewers || []} userId={user.id} />
    </div>
  );
}
