-- Complete, repeatable Sahayog schema for Supabase.
-- Keycloak remains the sign-in provider; public.user_identities maps external
-- subjects to application profiles. Never store passwords in this schema.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM (
      'citizen', 'mp', 'contractor', 'district_authority',
      'state_authority', 'nodal_officer', 'ministry',
      'application_reviewer'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'application_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'project_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.project_status AS ENUM (
      'draft', 'sanctioned', 'in_progress', 'completed', 'on_hold', 'cancelled'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'citizen',
  state TEXT,
  district TEXT,
  constituency TEXT,
  house TEXT,
  department TEXT,
  designation TEXT,
  company_name TEXT,
  business_registration TEXT,
  profile_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('keycloak', 'supabase')),
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT,
  business_registration TEXT,
  address TEXT,
  state TEXT,
  district TEXT,
  pan_number TEXT,
  gst_number TEXT,
  bank_account TEXT,
  bank_ifsc TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.account_applications
  ADD COLUMN IF NOT EXISTS keycloak_user_id TEXT;

CREATE TABLE IF NOT EXISTS public.contractor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.user_role NOT NULL,
  email TEXT NOT NULL,
  keycloak_user_id TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  profile_json JSONB NOT NULL DEFAULT '{}',
  documents_json JSONB NOT NULL DEFAULT '[]',
  status public.application_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note TEXT
);

CREATE TABLE IF NOT EXISTS public.mp_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year TEXT NOT NULL,
  mp_name TEXT NOT NULL,
  constituency TEXT NOT NULL,
  state TEXT NOT NULL,
  house TEXT,
  allocated_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (financial_year, mp_name, constituency, state)
);

CREATE TABLE IF NOT EXISTS public.mplads_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT NOT NULL UNIQUE,
  work_description TEXT NOT NULL,
  category TEXT,
  mp_name TEXT,
  constituency TEXT,
  state TEXT,
  house TEXT,
  amount NUMERIC(15,2),
  work_status TEXT NOT NULL DEFAULT 'recommended'
    CHECK (work_status IN ('recommended', 'sanctioned', 'in_progress', 'completed', 'cancelled')),
  recommendation_date DATE,
  completed_date DATE,
  has_images BOOLEAN,
  average_rating NUMERIC(4,2),
  ida TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mp_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year TEXT,
  mp_name TEXT NOT NULL,
  constituency TEXT NOT NULL,
  state TEXT NOT NULL,
  house TEXT,
  allocated_amount NUMERIC(15,2),
  amount_recommended NUMERIC(15,2),
  total_expenditure NUMERIC(15,2),
  utilization_percent NUMERIC(6,2),
  completed_works INTEGER,
  recommended_works INTEGER,
  completion_rate_percent NUMERIC(6,2),
  unpaid_vendor_balance NUMERIC(15,2),
  transaction_count INTEGER,
  successful_payments INTEGER,
  pending_payments INTEGER,
  average_rating NUMERIC(4,2),
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (financial_year, mp_name, constituency, state)
);

CREATE TABLE IF NOT EXISTS public.recommended_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT NOT NULL,
  work_description TEXT NOT NULL,
  category TEXT,
  mp_name TEXT,
  constituency TEXT,
  state TEXT,
  house TEXT,
  recommended_amount NUMERIC(15,2),
  recommendation_date DATE,
  has_images BOOLEAN,
  ida TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_id, recommendation_date)
);

CREATE TABLE IF NOT EXISTS public.completed_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT NOT NULL,
  work_description TEXT NOT NULL,
  category TEXT,
  mp_name TEXT,
  constituency TEXT,
  state TEXT,
  house TEXT,
  final_amount NUMERIC(15,2),
  completed_date DATE,
  has_images BOOLEAN,
  average_rating NUMERIC(4,2),
  ida TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_id, completed_date)
);

CREATE TABLE IF NOT EXISTS public.expenditure_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_name TEXT,
  constituency TEXT,
  state TEXT,
  house TEXT,
  work_description TEXT NOT NULL,
  vendor TEXT,
  ida TEXT,
  expenditure_amount NUMERIC(15,2) NOT NULL,
  expenditure_date DATE,
  payment_status TEXT,
  record_hash TEXT UNIQUE,
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mplads_work_id TEXT REFERENCES public.mplads_works(work_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sanctioned_amount NUMERIC(15,2) NOT NULL CHECK (sanctioned_amount > 0),
  actual_expenditure NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (actual_expenditure >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  mp_name TEXT NOT NULL,
  constituency TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  location TEXT NOT NULL,
  status public.project_status NOT NULL DEFAULT 'sanctioned',
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (completion_percent BETWEEN 0 AND 100),
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  contractor_email TEXT NOT NULL,
  contractor_name TEXT NOT NULL DEFAULT '',
  created_by_sub TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_project_date_range CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.work_projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  completion_percent NUMERIC(5,2) NOT NULL CHECK (completion_percent BETWEEN 0 AND 100),
  hours_worked NUMERIC(4,1) NOT NULL CHECK (hours_worked BETWEEN 0 AND 24),
  materials TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  submitted_by_email TEXT NOT NULL,
  submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  photos_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_report_per_project_date UNIQUE (project_id, report_date)
);

CREATE TABLE IF NOT EXISTS public.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  issuing_authority TEXT,
  state TEXT,
  district TEXT,
  published_at TIMESTAMPTZ,
  closing_at TIMESTAMPTZ,
  estimated_value NUMERIC(15,2),
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bill_of_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id TEXT,
  item_code TEXT,
  description TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(16,4),
  unit_rate NUMERIC(15,2),
  amount NUMERIC(15,2),
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  external_contractor_id TEXT,
  contractor_name TEXT NOT NULL,
  completed_projects INTEGER NOT NULL DEFAULT 0,
  late_projects INTEGER NOT NULL DEFAULT 0,
  average_delay_days NUMERIC(8,2),
  performance_rating NUMERIC(4,2),
  source_payload JSONB NOT NULL DEFAULT '{}',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_anomaly_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.work_projects(id) ON DELETE CASCADE,
  sanctioned_cost NUMERIC(15,2),
  actual_expenditure NUMERIC(15,2),
  physical_progress_pct NUMERIC(5,2),
  anomaly_score NUMERIC(10,6) NOT NULL,
  anomaly_flag BOOLEAN NOT NULL DEFAULT FALSE,
  findings_json JSONB NOT NULL DEFAULT '[]',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.source_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_date DATE,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Add fields introduced by this complete model when the original schema
-- (migration 001) has already been applied.
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS mplads_work_id TEXT REFERENCES public.mplads_works(work_id) ON DELETE SET NULL;
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS actual_expenditure NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS status public.project_status NOT NULL DEFAULT 'sanctioned';
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL;
ALTER TABLE public.work_projects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.work_reports
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_anomaly_scores
  ADD COLUMN IF NOT EXISTS findings_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

INSERT INTO public.user_profiles (auth_user_id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'full_name', ''),
  'citizen'
FROM auth.users AS u
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO public.user_identities (profile_id, provider, subject)
SELECT p.id, 'supabase', u.id::TEXT
FROM auth.users AS u
JOIN public.user_profiles AS p ON p.auth_user_id = u.id
ON CONFLICT (provider, subject) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_identities_profile ON public.user_identities(profile_id);
CREATE INDEX IF NOT EXISTS idx_contractors_state_district ON public.contractors(state, district);
CREATE INDEX IF NOT EXISTS idx_contractors_active ON public.contractors(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_contractor_documents_contractor ON public.contractor_documents(contractor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status_created ON public.account_applications(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_per_email_role
  ON public.account_applications(email, role) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mplads_works_scope ON public.mplads_works(state, constituency);
CREATE INDEX IF NOT EXISTS idx_mplads_works_status ON public.mplads_works(work_status);
CREATE INDEX IF NOT EXISTS idx_mp_summaries_scope ON public.mp_summaries(state, constituency);
CREATE INDEX IF NOT EXISTS idx_recommended_works_scope ON public.recommended_works(state, constituency);
CREATE INDEX IF NOT EXISTS idx_completed_works_scope ON public.completed_works(state, constituency);
CREATE INDEX IF NOT EXISTS idx_expenditure_records_scope ON public.expenditure_records(state, constituency, expenditure_date);
CREATE INDEX IF NOT EXISTS idx_projects_contractor_email ON public.work_projects(contractor_email, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_projects_contractor_id ON public.work_projects(contractor_id);
CREATE INDEX IF NOT EXISTS idx_projects_scope ON public.work_projects(state, district, constituency);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.work_projects(status);
CREATE INDEX IF NOT EXISTS idx_reports_project_date ON public.work_reports(project_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_submitted_by ON public.work_reports(submitted_by_email);
CREATE INDEX IF NOT EXISTS idx_tenders_id ON public.tenders(tender_id);
CREATE INDEX IF NOT EXISTS idx_boq_work_id ON public.bill_of_quantities(work_id);
CREATE INDEX IF NOT EXISTS idx_contractor_history_contractor ON public.contractor_history(contractor_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_flagged ON public.project_anomaly_scores(anomaly_flag)
  WHERE anomaly_flag;
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_id UUID;
BEGIN
  INSERT INTO public.user_profiles (auth_user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'citizen'
  )
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email
  RETURNING id INTO profile_id;

  INSERT INTO public.user_identities (profile_id, provider, subject)
  VALUES (profile_id, 'supabase', NEW.id::TEXT)
  ON CONFLICT (provider, subject) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_user_profile ON auth.users;
CREATE TRIGGER trg_create_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

DROP TRIGGER IF EXISTS trg_contractors_updated_at ON public.contractors;
CREATE TRIGGER trg_contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.work_projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.work_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_project_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.work_projects
  SET completion_percent = NEW.completion_percent,
      status = CASE
        WHEN NEW.completion_percent >= 100 THEN 'completed'::public.project_status
        WHEN NEW.completion_percent > 0 THEN 'in_progress'::public.project_status
        ELSE status
      END
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_project_completion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_project_completion ON public.work_reports;
CREATE TRIGGER trg_sync_project_completion
  AFTER INSERT ON public.work_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_completion();

CREATE OR REPLACE VIEW public.v_project_summary
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.title,
  p.state,
  p.district,
  p.constituency,
  p.mp_name,
  p.status,
  p.sanctioned_amount,
  p.actual_expenditure,
  p.completion_percent,
  p.start_date,
  p.end_date,
  p.contractor_email,
  p.contractor_name,
  c.company_name AS contractor_company,
  c.phone AS contractor_phone,
  a.anomaly_score,
  a.anomaly_flag,
  (SELECT COUNT(*) FROM public.work_reports r WHERE r.project_id = p.id) AS total_reports,
  (SELECT MAX(r.report_date) FROM public.work_reports r WHERE r.project_id = p.id) AS last_report_date
FROM public.work_projects p
LEFT JOIN public.contractors c ON c.id = p.contractor_id
LEFT JOIN public.project_anomaly_scores a ON a.project_id = p.id;

COMMENT ON TABLE public.contractors IS
  'Contractor business records. Store files in private Storage; never store passwords here.';
COMMENT ON TABLE public.user_profiles IS
  'Application profile and server-managed role; authentication credentials stay in the identity provider.';
COMMENT ON TABLE public.user_identities IS
  'Maps Keycloak or Supabase Auth subjects to application profiles without storing credentials.';
COMMENT ON TABLE public.mplads_works IS
  'Imported recommended and completed MPLADS work records from official exports.';
COMMENT ON TABLE public.work_reports IS
  'Contractor-submitted progress, location, and private photo references.';

-- Make policies restrictive by default. Existing broad policies from migration
-- 001 are removed so authenticated users cannot read private contractor or
-- contractor-report data.
DROP POLICY IF EXISTS authenticated_read_contractors ON public.contractors;
DROP POLICY IF EXISTS authenticated_read_projects ON public.work_projects;
DROP POLICY IF EXISTS authenticated_read_reports ON public.work_reports;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_profiles', 'user_identities', 'contractors', 'contractor_documents',
    'account_applications', 'mp_allocations', 'mplads_works',
    'mp_summaries', 'recommended_works', 'completed_works',
    'expenditure_records', 'work_projects', 'work_reports',
    'tenders', 'bill_of_quantities', 'contractor_history',
    'project_anomaly_scores', 'audit_log', 'source_import_batches'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'service_role_manage'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_manage ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  policy_row RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'user_profiles_read_self'
  ) THEN
    CREATE POLICY user_profiles_read_self
      ON public.user_profiles FOR SELECT TO authenticated
      USING (auth_user_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contractors'
      AND policyname = 'contractors_read_self'
  ) THEN
    CREATE POLICY contractors_read_self
      ON public.contractors FOR SELECT TO authenticated
      USING (auth_user_id = (SELECT auth.uid()));
  END IF;

  FOR policy_row IN
    SELECT * FROM (VALUES
      ('public_read_mplads_works', 'mplads_works'),
      ('public_read_mp_summaries', 'mp_summaries'),
      ('public_read_recommended_works', 'recommended_works'),
      ('public_read_completed_works', 'completed_works'),
      ('public_read_expenditure_records', 'expenditure_records')
    ) AS policies(policy_name, table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = policy_row.table_name
        AND policyname = policy_row.policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        policy_row.policy_name,
        policy_row.table_name
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON TABLE
  public.user_profiles, public.user_identities, public.contractors, public.contractor_documents,
  public.account_applications, public.mp_allocations, public.mplads_works,
  public.mp_summaries, public.recommended_works, public.completed_works,
  public.expenditure_records, public.work_projects, public.work_reports,
  public.tenders, public.bill_of_quantities, public.contractor_history,
  public.project_anomaly_scores, public.audit_log, public.source_import_batches,
  public.v_project_summary
FROM anon, authenticated;

GRANT SELECT ON TABLE public.user_profiles, public.contractors TO authenticated;
GRANT SELECT ON TABLE
  public.mplads_works, public.mp_summaries, public.recommended_works,
  public.completed_works, public.expenditure_records
TO anon, authenticated;
GRANT ALL ON TABLE
  public.user_profiles, public.user_identities, public.contractors, public.contractor_documents,
  public.account_applications, public.mp_allocations, public.mplads_works,
  public.mp_summaries, public.recommended_works, public.completed_works,
  public.expenditure_records, public.work_projects, public.work_reports,
  public.tenders, public.bill_of_quantities, public.contractor_history,
  public.project_anomaly_scores, public.audit_log, public.source_import_batches,
  public.v_project_summary
TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('application-documents', 'application-documents', FALSE),
  ('work-report-photos', 'work-report-photos', FALSE),
  ('contractor-documents', 'contractor-documents', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

COMMIT;
