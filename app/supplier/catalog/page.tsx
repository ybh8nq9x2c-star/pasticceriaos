import { listOwnCatalog } from '@/modules/marketplace/service';
import { CatalogManager } from '@/components/marketplace/CatalogManager';

export default async function SupplierCatalogPage() {
  const items = await listOwnCatalog();
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <h1 className="font-playfair text-2xl sm:text-3xl font-bold mb-1">Catalogo</h1>
      <p className="text-sm text-[#6B7280] mb-5 sm:mb-6">I prodotti visibili ai clienti collegati.</p>
      <CatalogManager items={items} />
    </div>
  );
}
