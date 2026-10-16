import Link from 'next/link';

export const metadata = { title: 'No access' };

export default function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">No access</h1>
        <p className="mt-3 text-lg text-gray-600">
          Your account is signed in but does not have access to this page. Ask an
          administrator if you think it should.
        </p>
        <Link href="/" className="mt-6 inline-block text-blue-600 underline">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
