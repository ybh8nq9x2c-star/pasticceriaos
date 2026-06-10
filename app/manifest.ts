import type { MetadataRoute } from 'next';

// PWA manifest (served at /manifest.webmanifest; Next injects the <link> tag).
// Installable, standalone, mobile-first. No native shell — same Next.js app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PasticceriaOS',
    short_name: 'PasticceriaOS',
    description: 'Il sistema operativo per la tua pasticceria — gestione, magazzino e marketplace fornitori.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF7F2',
    theme_color: '#1A2B4A',
    lang: 'it',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
