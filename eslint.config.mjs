// =============================================================================
// eslint.config.mjs — ESLint 9 flat config (W7).
// `next lint` è deprecato da Next 15.5: `npm run lint` lancia `eslint .`
// direttamente. La build NON esegue il lint (next.config.mjs →
// eslint.ignoreDuringBuilds): il lint è un gate separato.
// =============================================================================
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Generato da `supabase gen types`.
      'lib/database.types.ts',
      // Suite e2e self-contained (proprio package.json / node_modules).
      'e2e/**',
      'playwright.config.ts',
      // Edge functions Deno: runtime e import diversi dall'app.
      'supabase/functions/**',
      '**/.fuse_hidden*',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // La UI è in italiano: gli apostrofi nel testo JSX ("l'ordine") sono
      // voluti e React li rende correttamente. Escaparli peggiora solo la lettura.
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
