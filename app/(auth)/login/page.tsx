// =============================================================================
// app/(auth)/login/page.tsx
// Server Component: legge il deep-link `next` (impostato dal middleware) e lo
// passa al form client. Niente useSearchParams lato client → niente problemi di
// prerender; la pagina è dinamica perché legge searchParams.
// =============================================================================

import { safeNextPath } from '@/lib/safe-next';
import { LoginForm } from './LoginForm';

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  // F-10: stesso controllo della server action (lib/safe-next.ts).
  const next = safeNextPath(searchParams.next, '');
  return <LoginForm next={next} />;
}
