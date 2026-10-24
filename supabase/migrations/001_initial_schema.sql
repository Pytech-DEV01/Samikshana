-- ============================================================
-- Sahayog MPLADS — Supabase PostgreSQL Schema
-- Migration 001: Initial tables for contractors, projects,
--   work reports, account applications, anomaly scores, and
--   an audit log.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'citizen',
  'mp',
  'contractor',
  'district_authority',
  'state_authority',
  'nodal_officer',
  'ministry',
  'application_reviewer'
);

CREATE TYPE application_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE project_status AS ENUM (
  'draft',
  'sanctioned',
  'in_progress',
  'completed',
  'on_hold',
  'cancelled'
);

-- ────────────────────────────────────────────────────────────
-- 2. CONTRACTORS
-- ────────────────────────────────────────────────────────────

CREATE TABLE contractors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  company_name    TEXT,
  business_registration TEXT,
  address         TEXT,
  state           TEXT,
  district        TEXT,
  pan_number      TEXT,
  gst_number      TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  profile_json    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contractors_email      ON contractors (email);
CREATE INDEX idx_contractors_state      ON contractors (state);
CREATE INDEX idx_contractors_district   ON contractors (state, district);
CREATE INDEX idx_contractors_active     ON contractors (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE contractors IS
  'Registered contractors eligible for MPLADS work assignments.';

-- ────────────────────────────────────────────────────────────
-- 3. ACCOUNT APPLICATIONS  (registration workflow)
-- ────────────────────────────────────────────────────────────

CREATE TABLE account_applications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role            user_role NOT NULL,
  email           TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  profile_json    JSONB NOT NULL DEFAULT '{}',
  documents_json  JSONB NOT NULL DEFAULT '[]',
  status          application_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  review_note     TEXT
);

CREATE INDEX idx_applications_status_created
  ON account_applications (status, created_at DESC);

CREATE UNIQUE INDEX idx_one_pending_per_email_role
  ON account_applications (email, role)
  WHERE status = 'pending';

COMMENT ON TABLE account_applications IS
  'Registration requests awaiting review by an application_reviewer.';

-- ────────────────────────────────────────────────────────────
-- 4. WORK PROJECTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE work_projects (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  sanctioned_amount NUMERIC(15,2) NOT NULL CHECK (sanctioned_amount > 0),
  actual_expenditure NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (actual_expenditure >= 0),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  mp_name           TEXT NOT NULL,
  constituency      TEXT NOT NULL,
  state             TEXT NOT NULL,
  district          TEXT NOT NULL,
  location          TEXT NOT NULL,
  status            project_status NOT NULL DEFAULT 'sanctioned',
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  contractor_id     UUID REFERENCES contractors(id) ON DELETE SET NULL,
  contractor_email  TEXT NOT NULL,
  contractor_name   TEXT NOT NULL DEFAULT '',
  created_by_sub    TEXT NOT NULL,
  created_by_email  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_projects_contractor_email  ON work_projects (contractor_email, start_date DESC);
CREATE INDEX idx_projects_contractor_id     ON work_projects (contractor_id);
CREATE INDEX idx_projects_state_district    ON work_projects (state, district);
CREATE INDEX idx_projects_constituency      ON work_projects (state, constituency);
CREATE INDEX idx_projects_status            ON work_projects (status);
CREATE INDEX idx_projects_created           ON work_projects (created_at DESC);

COMMENT ON TABLE work_projects IS
  'MPLADS works sanctioned under an MP's constituency allocation.';

-- ────────────────────────────────────────────────────────────
-- 5. WORK REPORTS  (daily contractor progress)
-- ────────────────────────────────────────────────────────────

CREATE TABLE work_reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
  report_date         DATE NOT NULL,
  completion_percent  NUMERIC(5,2) NOT NULL CHECK (completion_percent BETWEEN 0 AND 100),
  hours_worked        NUMERIC(4,1) NOT NULL CHECK (hours_worked BETWEEN 0 AND 24),
  materials           TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  latitude            NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude           NUMERIC(10,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  submitted_by_email  TEXT NOT NULL,
  photos_json         JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_report_per_project_date UNIQUE (project_id, report_date)
);

CREATE INDEX idx_reports_project_date
  ON work_reports (project_id, report_date DESC);

CREATE INDEX idx_reports_submitted_by
  ON work_reports (submitted_by_email);

COMMENT ON TABLE work_reports IS
  'Daily progress reports submitted by contractors with geo-tagged photos.';

-- ────────────────────────────────────────────────────────────
-- 6. PROJECT ANOMALY SCORES  (ML risk engine output)
-- ────────────────────────────────────────────────────────────

CREATE TABLE project_anomaly_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES work_projects(id) ON DELETE CASCADE,
  sanctioned_cost NUMERIC(15,2),
  actual_expenditure NUMERIC(15,2),
  physical_progress_pct NUMERIC(5,2),
  anomaly_score   NUMERIC(10,6) NOT NULL,
  anomaly_flag    BOOLEAN NOT NULL DEFAULT FALSE,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_score_per_project UNIQUE (project_id)
);

CREATE INDEX idx_anomaly_flagged
  ON project_anomaly_scores (anomaly_flag) WHERE anomaly_flag = TRUE;

COMMENT ON TABLE project_anomaly_scores IS
  'ML-generated risk / anomaly scores for fraud detection on MPLADS works.';

-- ────────────────────────────────────────────────────────────
-- 7. AUDIT LOG  (tracks important changes)
-- ────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,    -- INSERT, UPDATE, DELETE
  actor_email TEXT,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_created      ON audit_log (created_at DESC);

COMMENT ON TABLE audit_log IS
  'Immutable audit trail for regulatory compliance (MPLADS guidelines).';

-- ────────────────────────────────────────────────────────────
-- 8. AUTO-UPDATE updated_at TRIGGER
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contractors_updated_at
  BEFORE UPDATE ON contractors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON work_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 9. AUTO-SYNC project completion from latest report
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_project_completion()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE work_projects
  SET completion_percent = NEW.completion_percent,
      status = CASE
        WHEN NEW.completion_percent >= 100 THEN 'completed'::project_status
        WHEN NEW.completion_percent > 0    THEN 'in_progress'::project_status
        ELSE status
      END
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_project_completion
  AFTER INSERT ON work_reports
  FOR EACH ROW EXECUTE FUNCTION sync_project_completion();

-- ────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE contractors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_applications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_anomaly_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (for server-side access from your Flask app)
CREATE POLICY "service_role_all_contractors"
  ON contractors FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_applications"
  ON account_applications FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_projects"
  ON work_projects FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_reports"
  ON work_reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_anomaly_scores"
  ON project_anomaly_scores FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_audit_log"
  ON audit_log FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users: read-only on contractors and projects
CREATE POLICY "authenticated_read_contractors"
  ON contractors FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_projects"
  ON work_projects FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_reports"
  ON work_reports FOR SELECT
  USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 11. STORAGE BUCKETS (for documents & photos)
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('application-documents', 'application-documents', FALSE),
  ('work-report-photos',    'work-report-photos',    FALSE)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 12. HELPER VIEWS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_project_summary AS
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
  c.phone        AS contractor_phone,
  a.anomaly_score,
  a.anomaly_flag,
  (SELECT COUNT(*) FROM work_reports r WHERE r.project_id = p.id) AS total_reports,
  (SELECT MAX(r.report_date) FROM work_reports r WHERE r.project_id = p.id) AS last_report_date
FROM work_projects p
LEFT JOIN contractors c ON c.id = p.contractor_id
LEFT JOIN project_anomaly_scores a ON a.project_id = p.id;

COMMENT ON VIEW v_project_summary IS
  'Flattened project view joining contractor details and anomaly scores — used by dashboards.';
