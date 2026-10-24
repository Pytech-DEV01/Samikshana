BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'project_assigned', 'report_submitted', 'report_reviewed',
      'application_approved', 'application_rejected', 'message_received'
    )
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  project_id UUID REFERENCES public.work_projects(id) ON DELETE CASCADE,
  project_title TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON public.notifications(recipient_email, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_manage_notifications ON public.notifications;
CREATE POLICY service_role_manage_notifications ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

COMMENT ON TABLE public.notifications IS
  'In-app notifications delivered to users when projects are assigned, reports submitted, or reviews completed.';

COMMIT;
