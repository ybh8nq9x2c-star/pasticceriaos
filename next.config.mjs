/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTA su `experimental.ppr`: richiede Next canary — su 14.2 stable rompe la
  // build. Lo streaming si ottiene comunque con i loading.tsx route-level.
  eslint: {
    // Linting eseguito separatamente via `npm run lint`.
    ignoreDuringBuilds: true,
  },

  // Compressione gzip e header puliti
  compress: true,
  poweredByHeader: false,

  images: {
    formats: ['image/avif', 'image/webp'],
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
