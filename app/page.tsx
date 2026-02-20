import { NavBarSupabase } from '@/components/navbar-supabase';
import { rootDomain } from '@/lib/utils';

export default async function HomePage() {
  const year = new Date().getFullYear();

  return (
    <>
      <NavBarSupabase />
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50 to-white">
        <main className="flex flex-1 flex-col items-center justify-center p-4 pt-20">
          <div className="w-full max-w-2xl space-y-10">
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                {rootDomain}
              </h1>
              <p className="mt-3 text-lg text-gray-500">
                Phygital 3D experience platform
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-4">
              <h2 className="text-xl font-semibold text-gray-800">What is this?</h2>
              <p className="text-gray-600 leading-relaxed">
                This platform lets you create phygital experiences and share them with
                your audience. Admins set up <strong>viewers, 3D models</strong> — each one displays a 3D model
                that visitors can personalise by uploading their own drawings. The uploaded
                image wraps around the model in real time, so every visitor sees a unique result.
              </p>
            </div>
          </div>
        </main>

        <footer className="w-full border-t border-gray-100 bg-white py-5 px-4 mt-10">
          <p className="text-center text-sm text-gray-400">
            © {year} <span className="font-medium text-gray-500">&ldquo;We Rock&rdquo;</span> — All rights reserved.
            Developed by &ldquo;Art More&rdquo;, SIA
          </p>
        </footer>
      </div>
    </>
  );
}


