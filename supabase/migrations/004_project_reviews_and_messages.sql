BEGIN;

ALTER TABLE public.work_reports
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      review_status IN (
        'pending', 'approved', 'rejected', 'clarification_requested'
      )
    ),
  ADD COLUMN IF NOT EXISTS reviewed_by_sub TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE TABLE IF NOT EXISTS public.project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.work_projects(id) ON DELETE CASCADE,
  sender_sub TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (
    message_type IN (
      'message', 'review', 'clarification_request', 'clarification_response'
    )
  ),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_messages_project_created
  ON public.project_messages(project_id, created_at);

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_manage ON public.project_messages;
CREATE POLICY service_role_manage ON public.project_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.project_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.project_messages TO service_role;

COMMENT ON TABLE public.project_messages IS
  'Private project review and clarification thread, returned only to assigned contractors and in-scope authorities by the Flask server.';
COMMENT ON COLUMN public.work_reports.review_status IS
  'Authority review state for contractor-submitted progress; pending reports are not presented as verified public progress.';

COMMIT;
