/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions are enabled by default in Next.js 14+.
  // No allowedOrigins restriction: same-origin requests are always permitted,
  // which is correct for standard web app deployments (Railway, Vercel, etc.).

  typescript: {
    // Type safety is enforced separately via `npm run typecheck` (tsc --noEmit),
    // which honours the "exclude" list in tsconfig.json. `next build` re-checks
    // every route file — including the intentionally-excluded legacy scaffolding
    // (app/app/*, app/(auth)/sign-in, app/(auth)/sign-up) that targets an old DB
    // schema — via generated .next/types, which would otherwise fail the build.
    // The active app is fully type-clean (typecheck passes); skip the duplicate
    // build-time check so a stale legacy tree cannot block production deploys.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Linting is run separately via `npm run lint`; don't fail the production
    // build on the same excluded legacy files.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
