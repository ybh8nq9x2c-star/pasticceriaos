-- =============================================================================
-- 011_rpc_create_organization.sql
-- RPC SECURITY DEFINER per creare un'organizzazione durante l'onboarding.
--
-- Perché SECURITY DEFINER:
--   L'utente autenticato non ha policy INSERT su `organizations` (intenzionale).
--   Questa funzione crea atomicamente: organization + org_member (owner).
--   Gira con i privilegi del owner della funzione (postgres), bypassando RLS.
--
-- Input:
--   p_name  TEXT          Nome della pasticceria/organizzazione
--   p_slug  TEXT          Slug URL-safe (validato dall'app prima della chiamata)
--   p_city  TEXT DEFAULT NULL
--   p_email TEXT DEFAULT NULL
--
-- Output:
--   organization_id UUID   ID della nuova organizzazione
--   member_id       UUID   ID del record org_members creato
--
-- Idempotenza:
--   Se l'utente corrente ha già un'organizzazione, la funzione lancia un'eccezione.
--   Il check è sull'utente corrente (auth.uid()), non sullo slug.
--
-- Sicurezza:
--   Verifica che auth.uid() sia valorizzato (utente autenticato).
--   La funzione non può essere chiamata anonimamente.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_organization(
  p_name  TEXT,
  p_slug  TEXT,
  p_city  TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE(organization_id UUID, member_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_org_id         UUID;
  v_member_id      UUID;
  v_existing_org   UUID;
BEGIN
  -- 1. Verifica che l'utente sia autenticato
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_organization: utente non autenticato' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Verifica che l'utente non abbia già un'organizzazione (MVP: 1 org per utente)
  SELECT om.organization_id INTO v_existing_org
  FROM org_members om
  WHERE om.user_id = v_user_id
  LIMIT 1;

  IF v_existing_org IS NOT NULL THEN
    RAISE EXCEPTION 'create_organization: utente già associato a un''organizzazione (id: %)', v_existing_org
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validazione input
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'create_organization: p_name non può essere vuoto' USING ERRCODE = 'P0003';
  END IF;

  IF p_slug IS NULL OR char_length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'create_organization: p_slug non può essere vuoto' USING ERRCODE = 'P0004';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'create_organization: p_slug non valido (solo minuscole, numeri, trattini)' USING ERRCODE = 'P0005';
  END IF;

  -- 4. Crea l'organizzazione
  INSERT INTO organizations (name, slug, city, email)
  VALUES (trim(p_name), trim(p_slug), NULLIF(trim(COALESCE(p_city, '')), ''), NULLIF(trim(COALESCE(p_email, '')), ''))
  RETURNING id INTO v_org_id;

  -- 5. Crea il record org_members con ruolo owner
  INSERT INTO org_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  RETURNING id INTO v_member_id;

  -- 6. Restituisce i due ID creati
  RETURN QUERY SELECT v_org_id, v_member_id;
END;
$$;

COMMENT ON FUNCTION create_organization(TEXT, TEXT, TEXT, TEXT) IS
  'Onboarding RPC: crea organization + org_member(owner) atomicamente. SECURITY DEFINER richiesto perché l''utente non ha INSERT policy su organizations.';

-- Revoca accesso pubblico diretto: solo tramite questa funzione
-- (il default in Supabase è GRANT EXECUTE TO anon, authenticated)
REVOKE EXECUTE ON FUNCTION create_organization(TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION create_organization(TEXT, TEXT, TEXT, TEXT) TO authenticated;
