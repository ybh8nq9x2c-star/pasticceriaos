// =============================================================================
// lib/entity-label.ts — etichette entità DISAMBIGUATE.
// I fornitori possono essere omonimi (es. due "matteo emiri": uno email, uno
// marketplace). Mai mostrare un nome nudo dove si sceglie o si distingue:
// aggiungere sempre un secondo identificatore (email/P.IVA).
// =============================================================================

export interface SupplierLabelInput {
  name: string;
  email?: string | null;
}

/** "Nome — email" se l'email c'è, altrimenti solo il nome. Per i <select>. */
export function supplierLabel(s: SupplierLabelInput): string {
  return s.email ? `${s.name} — ${s.email}` : s.name;
}
