-- ================================================================
-- SIP Pause & Termination Tracker - Phase 1
-- Manual report imports, normalized SIP events, matching, and follow-up.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sip_report_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT DEFAULT 'manual_upload',
  file_name TEXT,
  file_hash TEXT,
  report_date DATE,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  import_status TEXT DEFAULT 'processing',
  total_rows INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  duplicate_records INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  matched_rows INTEGER DEFAULT 0,
  unmatched_rows INTEGER DEFAULT 0,
  error_summary JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES sip_report_imports(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  matched_status TEXT DEFAULT 'unmatched',
  match_confidence TEXT,
  match_reason TEXT,
  event_type TEXT DEFAULT 'unknown',
  follow_up_status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  notification_id UUID REFERENCES task_notifications(id) ON DELETE SET NULL,
  internal_remarks TEXT,
  row_fingerprint TEXT UNIQUE,
  fund TEXT,
  scheme TEXT,
  plan TEXT,
  product_code TEXT,
  folio_no TEXT,
  amount NUMERIC(14,2),
  start_date DATE,
  end_date DATE,
  termination_date DATE,
  frequency TEXT,
  agent TEXT,
  agent_name TEXT,
  subbroker TEXT,
  investor_name TEXT,
  email TEXT,
  mobile TEXT,
  phone TEXT,
  remarks TEXT,
  sip_flag TEXT,
  sip_registration_date DATE,
  ihno TEXT,
  to_scheme TEXT,
  to_plan TEXT,
  to_product_code TEXT,
  rejection_remarks TEXT,
  sip_registration_no TEXT,
  branch_code TEXT,
  raw_row JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sip_report_imports_status_check'
  ) THEN
    ALTER TABLE sip_report_imports ADD CONSTRAINT sip_report_imports_status_check
      CHECK (import_status IN ('processing', 'completed', 'completed_with_errors', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sip_events_matched_status_check'
  ) THEN
    ALTER TABLE sip_events ADD CONSTRAINT sip_events_matched_status_check
      CHECK (matched_status IN ('matched', 'unmatched', 'possible_match'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sip_events_match_confidence_check'
  ) THEN
    ALTER TABLE sip_events ADD CONSTRAINT sip_events_match_confidence_check
      CHECK (match_confidence IS NULL OR match_confidence IN ('high', 'medium', 'low'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sip_events_event_type_check'
  ) THEN
    ALTER TABLE sip_events ADD CONSTRAINT sip_events_event_type_check
      CHECK (event_type IN ('terminated', 'paused', 'rejected', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sip_events_follow_up_status_check'
  ) THEN
    ALTER TABLE sip_events ADD CONSTRAINT sip_events_follow_up_status_check
      CHECK (follow_up_status IN ('pending', 'contacted', 'client_informed', 'restarted', 'not_interested', 'resolved'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS sip_events_updated_at ON sip_events;
CREATE TRIGGER sip_events_updated_at
  BEFORE UPDATE ON sip_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_sip_report_imports_imported_at ON sip_report_imports(imported_at);
CREATE INDEX IF NOT EXISTS idx_sip_report_imports_file_hash ON sip_report_imports(file_hash);
CREATE INDEX IF NOT EXISTS idx_sip_events_client_id ON sip_events(client_id);
CREATE INDEX IF NOT EXISTS idx_sip_events_import_id ON sip_events(import_id);
CREATE INDEX IF NOT EXISTS idx_sip_events_event_type ON sip_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sip_events_follow_up_status ON sip_events(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_sip_events_termination_date ON sip_events(termination_date);
CREATE INDEX IF NOT EXISTS idx_sip_events_folio_no ON sip_events(folio_no);
CREATE INDEX IF NOT EXISTS idx_sip_events_mobile ON sip_events(mobile);
CREATE INDEX IF NOT EXISTS idx_sip_events_email ON sip_events(email);
CREATE INDEX IF NOT EXISTS idx_sip_events_row_fingerprint ON sip_events(row_fingerprint);
CREATE INDEX IF NOT EXISTS idx_sip_events_assigned_to ON sip_events(assigned_to);

ALTER TABLE sip_report_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sip_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage SIP imports" ON sip_report_imports;
CREATE POLICY "Admins can manage SIP imports" ON sip_report_imports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can view SIP imports" ON sip_report_imports;
CREATE POLICY "Operations can view SIP imports" ON sip_report_imports
  FOR SELECT USING (public.is_admin() OR public.is_operations());

DROP POLICY IF EXISTS "Admins can manage SIP events" ON sip_events;
CREATE POLICY "Admins can manage SIP events" ON sip_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can view assigned SIP events" ON sip_events;
CREATE POLICY "Operations can view assigned SIP events" ON sip_events
  FOR SELECT USING (
    public.is_admin()
    OR assigned_to = auth.uid()
    OR public.can_access_client(client_id)
  );

DROP POLICY IF EXISTS "Operations can update assigned SIP followups" ON sip_events;
CREATE POLICY "Operations can update assigned SIP followups" ON sip_events
  FOR UPDATE USING (public.is_admin() OR assigned_to = auth.uid())
  WITH CHECK (public.is_admin() OR assigned_to = auth.uid());
