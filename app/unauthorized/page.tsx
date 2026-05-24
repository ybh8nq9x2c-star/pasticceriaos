import Link from "next/link";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UnauthorizedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const accountType = params.type as "cliente" | "fornitore" | undefined;
  const from = typeof params.from === "string" ? params.from : undefined;

  const correctWorkspace =
    accountType === "cliente"
      ? { href: "/app/cliente/dashboard", label: "Dashboard Pasticceria", emoji: "🥐" }
      : { href: "/app/fornitore/dashboard", label: "Dashboard Fornitore", emoji: "🚚" };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-10 text-center space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <span className="text-3xl">🔒</span>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accesso non autorizzato</h1>
          <p className="mt-2 text-sm text-gray-500">
            Non hai i permessi per accedere a questa sezione della piattaforma.
          </p>
        </div>

        {/* Path that triggered the error */}
        {from && (
          <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-500 font-mono break-all">
            {from}
          </div>
        )}

        {/* Correct workspace suggestion */}
        {accountType && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-medium mb-3">Il tuo workspace corretto è:</p>
            <Link
              href={correctWorkspace.href}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A2B4A] text-white rounded-lg font-semibold text-sm hover:bg-[#243660] transition-colors"
            >
              <span>{correctWorkspace.emoji}</span>
              {correctWorkspace.label}
            </Link>
          </div>
        )}

        {/* Secondary action */}
        <div className="flex gap-3 justify-center">
          <Link
            href="/auth/sign-in"
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Accedi con un altro account
          </Link>
        </div>
      </div>
    </div>
  );
}
