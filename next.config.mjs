/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTA su `experimental.ppr`: richiede Next canary — su 14.2 stable rompe la
  // build. Lo streaming si ottiene comunque con i loading.tsx route-level.
  eslint: {
    // Linting eseguito separatamente via `npm run lint`.
    ignoreDuringBuilds: true,
  },

  experimental: {
    // pdf-parse (goods receipt engine) va risolto a runtime Node, non bundlato:
    // il wrapper del pacchetto ha side-effect incompatibili con webpack.
    serverComponentsExternalPackages: ['pdf-parse'],
  },

  // Compressione gzip e header puliti
  compress: true,
  poweredByHeader: false,

  images: {
    // SECURITY (F-01, SECURITY_REPORT.md): l'app non usa next/image. L'Image
    // Optimization API di Next 14 ha advisory RCE critiche (GHSA-2xp9-vwfh-vxw4,
    // GHSA-2464-fhr4-w9xw) ed è raggiungibile senza auth su /_next/image.
    // `unoptimized` spegne l'optimizer finché non si aggiorna Next (≥15.5.28).
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Il portale fornitore contiene il token nel path: mai in cache condivise.
        source: '/portal/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
