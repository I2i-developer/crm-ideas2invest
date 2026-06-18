-- Allow insurance imports to stage unmatched policy rows without creating CRM
-- clients or tasks. Client creation/linking can happen from a separate workflow.

ALTER TABLE IF EXISTS insurance_policies
  ALTER COLUMN client_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES insurance_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'matched',
  ADD COLUMN IF NOT EXISTS match_reason TEXT,
  ADD COLUMN IF NOT EXISTS imported_client_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS imported_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS raw_import_row JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policies_match_status_check'
  ) THEN
    ALTER TABLE insurance_policies ADD CONSTRAINT insurance_policies_match_status_check
      CHECK (match_status IN ('matched', 'unmatched', 'manual_linked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_policies_import_id ON insurance_policies(import_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_match_status ON insurance_policies(match_status);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_imported_client_name ON insurance_policies(imported_client_name);
