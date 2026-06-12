import { listSupplierKeys } from '@/modules/marketplace/service';
import { KeyManager } from '@/components/marketplace/KeyManager';

export default async function SupplierKeysPage() {
  const keys = await listSupplierKeys();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">Chiavi di accesso</h1>
      <p className="text-sm text-ink-muted mb-5 sm:mb-6">
        Una chiave permette a un cliente di collegarsi al tuo workspace. È revocabile e ruotabile in qualsiasi momento.
      </p>
      <KeyManager keys={keys} />
    </div>
  );
}
