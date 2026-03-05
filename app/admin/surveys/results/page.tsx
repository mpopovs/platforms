import { createClient } from '@/lib/supabase/server';
import { SurveyResultsViewer } from './survey-results-viewer';
import { TeacherSurveyResultsViewer } from './teacher-survey-results-viewer';

export default async function AdminSurveyResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === 'teacher' ? 'teacher' : 'visitor';

  const supabase = await createClient();
  
  // Auth enforced by middleware — user is guaranteed to be present
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;

  // Fetch user's viewers (parent/standalone only — excludes classroom children)
  const { data: viewers } = await supabase
    .from('viewers')
    .select('id, name')
    .eq('user_id', userId)
    .is('parent_viewer_id', null)
    .order('name');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-4xl font-bold mb-2">Survey Results</h1>
        <p className="text-gray-600">View and analyze survey responses.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b mb-6">
        <a
          href="?tab=visitor"
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            activeTab === 'visitor'
              ? 'bg-white border border-b-white text-gray-900 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Visitor Survey
        </a>
        <a
          href="?tab=teacher"
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            activeTab === 'teacher'
              ? 'bg-white border border-b-white text-gray-900 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Teacher Survey
        </a>
      </div>

      {activeTab === 'visitor' ? (
        <SurveyResultsViewer viewers={viewers || []} userId={userId} />
      ) : (
        <TeacherSurveyResultsViewer viewers={viewers || []} />
      )}
    </div>
  );
}
