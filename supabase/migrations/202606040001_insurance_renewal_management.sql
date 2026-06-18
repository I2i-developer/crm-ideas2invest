-- Insurance Renewal Management module extensions.
-- Additive schema: keeps existing insurance_policies behavior intact.

ALTER TABLE IF EXISTS insurance_policies
  ADD COLUMN IF NOT EXISTS issuance_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS grace_period_end_date DATE,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_renewal_date DATE,
  ADD COLUMN IF NOT EXISTS contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_date DATE;

UPDATE insurance_policies
SET due_date = COALESCE(due_date, renewal_date)
WHERE due_date IS NULL AND renewal_date IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policies_payment_status_check'
  ) THEN
    ALTER TABLE insurance_policies ADD CONSTRAINT insurance_policies_payment_status_check
      CHECK (payment_status IN ('Paid', 'Pending', 'Grace Period', 'Lapsed', 'Overdue'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS insurance_interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  remark TEXT NOT NULL,
  follow_up_outcome TEXT,
  next_follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT DEFAULT 'manual_upload',
  file_name TEXT,
  file_hash TEXT,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  import_status TEXT DEFAULT 'completed',
  total_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  unmatched_rows INTEGER DEFAULT 0,
  error_summary JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_renewal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  renewal_cycle_key TEXT NOT NULL,
  notification_id UUID REFERENCES task_notifications(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_for UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (policy_id, alert_type, renewal_cycle_key, created_for)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_imports_status_check'
  ) THEN
    ALTER TABLE insurance_imports ADD CONSTRAINT insurance_imports_status_check
      CHECK (import_status IN ('completed', 'completed_with_errors', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_renewal_alerts_type_check'
  ) THEN
    ALTER TABLE insurance_renewal_alerts ADD CONSTRAINT insurance_renewal_alerts_type_check
      CHECK (alert_type IN ('upcoming_30_day', 'due_this_week', 'due_today', 'overdue_followup', 'grace_period', 'lapsed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_policies_due_date ON insurance_policies(due_date);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_payment_status ON insurance_policies(payment_status);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_assigned_to ON insurance_policies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_company ON insurance_policies(insurance_company);
CREATE INDEX IF NOT EXISTS idx_insurance_logs_policy ON insurance_interaction_logs(policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_logs_client ON insurance_interaction_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_insurance_imports_imported_at ON insurance_imports(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_imports_file_hash ON insurance_imports(file_hash);
CREATE INDEX IF NOT EXISTS idx_insurance_alerts_policy ON insurance_renewal_alerts(policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_alerts_created_for ON insurance_renewal_alerts(created_for);

ALTER TABLE insurance_interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_renewal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Role-aware insurance logs select" ON insurance_interaction_logs;
CREATE POLICY "Role-aware insurance logs select" ON insurance_interaction_logs
  FOR SELECT USING (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Role-aware insurance logs insert" ON insurance_interaction_logs;
CREATE POLICY "Role-aware insurance logs insert" ON insurance_interaction_logs
  FOR INSERT WITH CHECK (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can manage insurance imports" ON insurance_imports;
CREATE POLICY "Admins can manage insurance imports" ON insurance_imports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Role-aware insurance alerts select" ON insurance_renewal_alerts;
CREATE POLICY "Role-aware insurance alerts select" ON insurance_renewal_alerts
  FOR SELECT USING (public.is_admin() OR created_for = auth.uid() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Role-aware insurance alerts insert" ON insurance_renewal_alerts;
CREATE POLICY "Role-aware insurance alerts insert" ON insurance_renewal_alerts
  FOR INSERT WITH CHECK (public.is_admin() OR created_for = auth.uid() OR public.can_access_client(client_id));
