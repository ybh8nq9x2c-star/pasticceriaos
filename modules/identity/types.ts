// =============================================================================
// modules/identity/types.ts
// Tipi dominio: organizzazione e membership.
// =============================================================================

import type { OrgRole } from '@/lib/database.types';
import type { FiscalDataSource, LegalForm } from './vat';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Profilo fiscale dell'organizzazione (colonne aggiunte da 038). */
export interface FiscalProfile {
  vatNumber: string | null;
  vatCountry: string;
  legalName: string | null;
  legalForm: LegalForm | null;
  fiscalDataSource: FiscalDataSource | null;
  vatValidatedAt: string | null;
  /** Idoneità alla fatturazione (P.IVA valida). NON attiva l'emissione. */
  billingEligible: boolean;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

/** Sessione utente arricchita con organizzazione e ruolo. */
export interface UserSession {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

/** Risultato della RPC create_organization. */
export interface CreateOrganizationResult {
  organizationId: string;
  memberId: string;
}
