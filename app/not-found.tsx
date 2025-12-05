
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Page Not Found
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          The page you are looking for does not exist.
        </p>
      </div>
    </div>
  );
}
