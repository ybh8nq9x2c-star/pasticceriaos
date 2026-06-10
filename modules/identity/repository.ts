// =============================================================================
// modules/identity/repository.ts
// Query database per il contesto identity.
// Tutte le funzioni usano il server client (Server Actions/Components).
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { createMarketplaceClient } from '@/modules/marketplace/db';
import { mapSupabaseError, NotFoundError } from '@/lib/errors';
import type { Organization, OrgMember, CreateOrganizationResult } from './types';
import type { OnboardingInput } from './schemas';
import { slugify } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (error) throw mapSupabaseError(error);
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    city: data.city,
    email: data.email,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateOrganization(
  orgId: string,
  updates: Partial<Pick<Organization, 'name' | 'city' | 'email'>>,
): Promise<Organization> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .update({
      name: updates.name,
      city: updates.city,
      email: updates.email,
    })
    .eq('id', orgId)
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    city: data.city,
    email: data.email,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function getMemberForCurrentUser(): Promise<OrgMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw mapSupabaseError(error);
  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    userId: data.user_id,
    role: data.role,
    createdAt: data.created_at,
  };
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at');

  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// RPC: create_organization (SECURITY DEFINER)
// Usata durante l'onboarding. Crea org + member atomicamente.
// ---------------------------------------------------------------------------

export async function rpcCreateOrganization(
  input: OnboardingInput,
): Promise<CreateOrganizationResult> {
  // Marketplace-typed client: knows the 5-arg create_organization signature.
  const supabase = await createMarketplaceClient();

  const slug = slugify(input.orgName);

  const { data, error } = await supabase.rpc('create_organization', {
    p_name:         input.orgName,
    p_slug:         slug,
    p_city:         input.city || undefined,
    p_email:        input.email || undefined,
    p_account_type: input.accountType,
  });

  if (error) throw mapSupabaseError(error);

  // data è un array di rows (RETURNS TABLE)
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new NotFoundError('Risultato RPC create_organization');

  return {
    organizationId: row.organization_id as string,
    memberId:       row.member_id as string,
  };
}
