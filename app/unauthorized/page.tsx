import Link from 'next/link';

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

// Shown only when a user's account type can't be resolved to a workspace.
// The normal wrong-workspace case redirects straight to the user's own home.
export default function UnauthorizedPage({ searchParams }: PageProps) {
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-10 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <span className="text-3xl">🔒</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accesso non autorizzato</h1>
          <p className="mt-2 text-sm text-gray-500">
            Non hai i permessi per accedere a questa sezione
            {from ? ` (${from})` : ''}. Ogni account può usare solo il proprio workspace.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/" className="block w-full py-3 rounded-xl bg-[#1A2B4A] text-white text-sm font-semibold hover:bg-[#243660]">
            Vai al mio workspace
          </Link>
          <Link href="/login" className="block w-full py-3 rounded-xl border border-[#E5DDD0] text-sm font-semibold text-[#1A2B4A] hover:bg-[#FAF7F2]">
            Accedi con un altro account
          </Link>
        </div>
      </div>
    </div>
  );
}
