// =============================================================================
// modules/identity/vat.ts
// Validazione P.IVA (checksum italiano, PURA e offline) + seam per un futuro
// company-lookup provider. La V1 è offline-first: nessuna rete, denominazione e
// forma giuridica restano manuali. Il provider è pluggabile: aggiungere un
// provider IT a pagamento NON richiede refactor, solo una nuova implementazione
// di VatLookupProvider e il suo cablaggio in getVatLookupProvider().
// =============================================================================

// ── Forma giuridica (set strutturato) ────────────────────────────────────────

export const LEGAL_FORMS = [
  'ditta_individuale',
  'srl',
  'srls',
  'spa',
  'sas',
  'snc',
  'sapa',
  'cooperativa',
  'altro',
] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number];

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  ditta_individuale: 'Ditta individuale',
  srl: 'S.r.l.',
  srls: 'S.r.l.s.',
  spa: 'S.p.A.',
  sas: 'S.a.s.',
  snc: 'S.n.c.',
  sapa: 'S.a.p.a.',
  cooperativa: 'Società cooperativa',
  altro: 'Altro',
};

export function normalizeLegalForm(raw: string | null | undefined): LegalForm | null {
  if (!raw) return null;
  return (LEGAL_FORMS as readonly string[]).includes(raw) ? (raw as LegalForm) : null;
}

/**
 * Suggerimento (NON autoritativo) della forma giuridica dal suffisso del nome.
 * Trasparente: serve solo a pre-selezionare il campo, l'utente conferma.
 */
export function guessLegalForm(name: string | null | undefined): LegalForm | null {
  if (!name) return null;
  const n = name.toLowerCase().replace(/[.\s]/g, '');
  if (/srls|sronlines/.test(n)) return 'srls';
  if (/srl|societaaresponsabilitalimitata/.test(n)) return 'srl';
  if (/sapa/.test(n)) return 'sapa';
  if (/spa/.test(n)) return 'spa';
  if (/sas/.test(n)) return 'sas';
  if (/snc/.test(n)) return 'snc';
  if (/coop/.test(n)) return 'cooperativa';
  return null;
}

// ── Validazione P.IVA ─────────────────────────────────────────────────────────

export interface VatValidation {
  ok: boolean;
  country: string; // 'IT' di default
  number: string; // cifre normalizzate
  formatted: string; // es. 'IT12345678901'
  reason?: string;
}

/** Checksum ufficiale della P.IVA italiana (11 cifre, algoritmo di Luhn da sinistra). */
export function italianVatChecksum(v: string): boolean {
  if (!/^\d{11}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let n = v.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Valida una P.IVA. V1: checksum solo per IT; estere → ok=false con motivo chiaro. */
export function validateVat(raw: string | null | undefined): VatValidation {
  const cleaned = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return { ok: false, country: 'IT', number: '', formatted: '', reason: 'Inserisci la Partita IVA.' };

  let country = 'IT';
  let number = cleaned;
  const m = cleaned.match(/^([A-Z]{2})(\d+)$/);
  if (m) {
    country = m[1];
    number = m[2];
  }

  if (country !== 'IT') {
    return {
      ok: false,
      country,
      number,
      formatted: country + number,
      reason: 'In questa versione è verificabile solo la P.IVA italiana. Puoi proseguire: sarà segnata come non verificata.',
    };
  }
  if (!/^\d{11}$/.test(number)) {
    return { ok: false, country, number, formatted: 'IT' + number, reason: 'La P.IVA italiana è composta da 11 cifre.' };
  }
  if (!italianVatChecksum(number)) {
    return { ok: false, country, number, formatted: 'IT' + number, reason: 'Codice di controllo non valido: ricontrolla le cifre.' };
  }
  return { ok: true, country: 'IT', number, formatted: 'IT' + number };
}

// ── Company-lookup provider (seam pluggabile) ─────────────────────────────────

export type FiscalDataSource = 'manual' | 'vies' | 'registro_imprese';

export interface VatCompanyInfo {
  legalName: string | null;
  legalForm: LegalForm | null;
}

export interface VatLookupResult {
  found: boolean;
  source: FiscalDataSource;
  company: VatCompanyInfo | null;
  warning?: string;
}

export interface VatLookupProvider {
  readonly source: FiscalDataSource;
  /** number/country già normalizzati e validati. Non deve mai lanciare: errori → found:false. */
  lookup(number: string, country: string): Promise<VatLookupResult>;
}

/** V1: nessun lookup esterno. Dati azienda manuali → la UI li raccoglie. */
export const manualOnlyProvider: VatLookupProvider = {
  source: 'manual',
  async lookup() {
    return { found: false, source: 'manual', company: null };
  },
};

/**
 * Punto unico di selezione del provider. V1 restituisce sempre il manuale.
 * Estensione futura (provider IT a pagamento): leggere una env (es.
 * VAT_LOOKUP_PROVIDER + chiave) e restituire qui la nuova implementazione —
 * il resto del flusso (service/actions/UI) resta invariato.
 */
export function getVatLookupProvider(): VatLookupProvider {
  return manualOnlyProvider;
}
