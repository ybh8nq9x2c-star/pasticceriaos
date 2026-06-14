// =============================================================================
// app/(auth)/login/page.tsx
// Server Component: legge il deep-link `next` (impostato dal middleware) e lo
// passa al form client. Niente useSearchParams lato client → niente problemi di
// prerender; la pagina è dinamica perché legge searchParams.
// =============================================================================

import { LoginForm } from './LoginForm';

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//')
    ? searchParams.next
    : '';
  return <LoginForm next={next} />;
}
