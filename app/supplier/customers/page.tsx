import { listConnectedCustomers } from '@/modules/marketplace/service';

export default async function SupplierCustomersPage() {
  const customers = await listConnectedCustomers();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 className="font-playfair text-2xl sm:text-3xl font-bold mb-1">Clienti collegati</h1>
      <p className="text-sm text-[#6B7280] mb-5 sm:mb-6">{customers.length} clienti hanno usato una tua chiave</p>
      <div className="bg-white rounded-2xl border border-[#E5DDD0] divide-y divide-[#F0EAE0]">
        {customers.length === 0 && <p className="p-6 text-center text-[#6B7280]">Nessun cliente collegato.</p>}
        {customers.map((c) => (
          <div key={c.connectionId} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
            <div className="min-w-0">
              <p className="font-medium truncate">{c.customerName}</p>
              <p className="text-xs text-[#6B7280]">Collegato il {new Date(c.connectedAt).toLocaleDateString('it-IT')}</p>
            </div>
            <span className="text-xs text-green-700 font-semibold">Attivo</span>
          </div>
        ))}
      </div>
    </div>
  );
}
