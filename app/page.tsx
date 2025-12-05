import { NavBarSupabase } from '@/components/navbar-supabase';
import { rootDomain } from '@/lib/utils';

export default async function HomePage() {
  return (
    <>
      <NavBarSupabase />
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4 pt-20">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">
              {rootDomain}
            </h1>
            <p className="mt-3 text-lg text-gray-600">
              Welcome!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
