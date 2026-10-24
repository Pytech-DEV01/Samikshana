BEGIN;

ALTER TABLE public.account_applications
  ADD COLUMN IF NOT EXISTS reviewed_by_identity TEXT;

COMMENT ON COLUMN public.account_applications.reviewed_by_identity IS
  'Email or subject of the Keycloak reviewer; reviewed_by is reserved for Supabase Auth UUIDs.';

COMMIT;
