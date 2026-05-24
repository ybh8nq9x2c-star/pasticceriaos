-- =============================================================================
-- 002_identity.sql
-- Identità tenant: organizations e org_members.
-- RLS applicata in 009_rls.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: aggiorna updated_at automaticamente.
-- Definita qui perché serve a tutte le tabelle successive.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- Un'organizzazione corrisponde a un tenant (pasticceria/laboratorio).
-- slug: usato per URL friendly e lookup veloce, formato [a-z0-9-].
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  city       TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT organizations_slug_key   UNIQUE (slug),
  CONSTRAINT organizations_name_check CHECK (char_length(trim(name)) > 0),
  CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$')
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE organizations IS
  'Tenant principale. Ogni organizzazione è un laboratorio/pasticceria isolato.';
COMMENT ON COLUMN organizations.slug IS
  'Identificatore URL-safe, lowercase, solo lettere/numeri/trattini.';

-- ---------------------------------------------------------------------------
-- org_members
-- Associa auth.users a organizations con un ruolo.
-- MVP: un utente appartiene a una sola organizzazione.
-- Il vincolo UNIQUE(user_id) non è qui per consentire multi-org in futuro,
-- ma la funzione current_organization_id() per MVP usa LIMIT 1.
-- ---------------------------------------------------------------------------
CREATE TABLE org_members (
  id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID     NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  user_id         UUID     NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role            org_role NOT NULL DEFAULT 'baker',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT org_members_org_user_key UNIQUE (organization_id, user_id)
);

COMMENT ON TABLE org_members IS
  'Membership: collega auth.users a organizations con ruolo.';
COMMENT ON COLUMN org_members.role IS
  'owner = accesso completo; baker = operativo; viewer = sola lettura (MVP+1).';
