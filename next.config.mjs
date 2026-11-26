import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root di tracing esplicita: senza, Next 15 risale al primo package-lock.json
  // trovato fuori dal repo (es. nella home) e sbaglia i path di output.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  eslint: {
    // Linting eseguito separatamente via `npm run lint`.
    ignoreDuringBuilds: true,
  },

  // pdf-parse (goods receipt engine) va risolto a runtime Node, non bundlato:
  // il wrapper del pacchetto ha side-effect incompatibili con webpack.
  // (Next 15: ex `experimental.serverComponentsExternalPackages`.)
  serverExternalPackages: ['pdf-parse'],

  // Compressione gzip e header puliti
  compress: true,
  poweredByHeader: false,

  images: {
    // SECURITY (F-01, SECURITY_REPORT.md): l'app non usa next/image, quindi
    // l'Image Optimization API (/_next/image, raggiungibile senza auth) è solo
    // superficie d'attacco. Con Next ≥15.5.28 le advisory RCE sono chiuse, ma
    // l'optimizer resta spento per riduzione della superficie (W7). Se un giorno
    // serve next/image: togliere questa riga E configurare `remotePatterns`.
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
