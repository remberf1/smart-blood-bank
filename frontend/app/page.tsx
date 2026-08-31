import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-white text-2xl">
            🩸
          </div>
          <span className="text-2xl font-bold text-gray-900">Smart Blood Bank</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
          Blood and oxygen, when every minute counts.
        </h1>
        <p className="mt-4 text-gray-600 text-lg">
          Find available blood near you, request a resource in an emergency, and get real-time
          updates by WhatsApp and email.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/request"
            className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            Request blood or oxygen
          </Link>
          <Link
            href="/donor/login"
            className="inline-flex items-center justify-center h-12 px-8 rounded-full border border-gray-300 text-gray-800 font-medium hover:bg-gray-50 transition-colors"
          >
            Donor portal
          </Link>
        </div>

        <div className="mt-10 text-sm text-gray-400">
          Hospital staff?{' '}
          <Link href="/login" className="text-red-600 font-medium hover:underline">
            Sign in to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
