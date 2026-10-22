import Link from 'next/link';

export const metadata = { title: 'No access' };

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">No access</h1>
        <p className="mt-3 text-lg text-gray-600">
          Your account is signed in but does not have access to this page. Ask an
          administrator if you think it should.
        </p>
        {email && (
          <p className="mt-4 rounded-lg bg-white p-3 text-left text-sm text-gray-600 shadow-sm">
            Signed in as <b>{email}</b>. To give this account admin access, run in the Supabase SQL editor:
            <code className="mt-2 block whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-xs">
              {`INSERT INTO public.profiles (id, role)
SELECT id, 'admin' FROM auth.users WHERE email = '${email.replace(/'/g, "''")}'
ON CONFLICT (id) DO UPDATE SET role = 'admin';`}
            </code>
            or add the email to <code>ADMIN_EMAILS</code> in the server’s .env and restart.
          </p>
        )}
        <Link href="/" className="mt-6 inline-block text-blue-600 underline">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
