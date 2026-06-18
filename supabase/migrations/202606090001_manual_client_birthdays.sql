-- Manually maintained client birthdays added from the CRM birthday calendar.

CREATE TABLE IF NOT EXISTS manual_client_birthdays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  client_name TEXT,
  person_type TEXT DEFAULT 'Client',
  date_of_birth DATE NOT NULL,
  mobile TEXT,
  email TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS manual_client_birthdays_updated_at ON manual_client_birthdays;
CREATE TRIGGER manual_client_birthdays_updated_at
  BEFORE UPDATE ON manual_client_birthdays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_manual_client_birthdays_date_of_birth
  ON manual_client_birthdays(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_manual_client_birthdays_client_id
  ON manual_client_birthdays(client_id);
CREATE INDEX IF NOT EXISTS idx_manual_client_birthdays_person_name
  ON manual_client_birthdays(person_name);

ALTER TABLE manual_client_birthdays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM roles can view manual birthdays" ON manual_client_birthdays;
CREATE POLICY "CRM roles can view manual birthdays" ON manual_client_birthdays
  FOR SELECT USING (public.is_admin() OR public.is_operations());

DROP POLICY IF EXISTS "CRM roles can add manual birthdays" ON manual_client_birthdays;
CREATE POLICY "CRM roles can add manual birthdays" ON manual_client_birthdays
  FOR INSERT WITH CHECK (
    (public.is_admin() OR public.is_operations())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "CRM roles can update manual birthdays" ON manual_client_birthdays;
CREATE POLICY "CRM roles can update manual birthdays" ON manual_client_birthdays
  FOR UPDATE USING (public.is_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_admin() OR created_by = auth.uid());
