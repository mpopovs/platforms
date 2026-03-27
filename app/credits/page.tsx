import { readFileSync } from 'fs';
import { join } from 'path';
import { NavBarSupabase } from '@/components/navbar-supabase';

export const metadata = {
  title: 'Credits & Open Source Licenses',
};

export default function CreditsPage() {
  const licensesPath = join(process.cwd(), 'public', 'credits', 'licenses.txt');
  const licensesText = readFileSync(licensesPath, 'utf-8');

  return (
    <>
      <NavBarSupabase />
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50 to-white">
        <main className="flex flex-1 flex-col items-center p-4 pt-24 pb-16">
          <div className="w-full max-w-3xl space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Credits &amp; Open Source Licenses
              </h1>
              <p className="mt-2 text-gray-500">
                This project makes use of the following open source packages.
              </p>
            </div>

            <pre className="w-full rounded-xl border border-gray-100 bg-white p-6 shadow-sm text-xs text-gray-600 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              {licensesText}
            </pre>
          </div>
        </main>
      </div>
    </>
  );
}
