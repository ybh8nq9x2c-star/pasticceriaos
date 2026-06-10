/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions are enabled by default in Next.js 14+.
  // No allowedOrigins restriction: same-origin requests are always permitted,
  // which is correct for standard web app deployments (Railway, Vercel, etc.).
  //
  // NOTE: the legacy prototype scaffolding (app/app/*, app/(auth)/sign-in,
  // app/(auth)/sign-up, components/cliente|fornitore, lib/actions, lib/data,
  // lib/types) has been REMOVED, so `next build` now type-checks the whole
  // active tree (no ignoreBuildErrors). Type safety is enforced both here and
  // via `npm run typecheck`.
  eslint: {
    // Linting is run separately via `npm run lint`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
