-- Client contact declaration flags and optional onboarding support documents.

ALTER TABLE IF EXISTS clients
  ADD COLUMN IF NOT EXISTS email_declaration_flag TEXT DEFAULT 'Self',
  ADD COLUMN IF NOT EXISTS mobile_declaration_flag TEXT DEFAULT 'Self';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_email_declaration_flag_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_email_declaration_flag_check
      CHECK (email_declaration_flag IS NULL OR email_declaration_flag IN (
        'Self', 'Spouse', 'Dependent Children', 'Dependent Siblings',
        'Dependent Parents', 'Guardian', 'PMS', 'Custodian', 'POA'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_mobile_declaration_flag_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_mobile_declaration_flag_check
      CHECK (mobile_declaration_flag IS NULL OR mobile_declaration_flag IN (
        'Self', 'Spouse', 'Dependent Children', 'Dependent Siblings',
        'Dependent Parents', 'Guardian', 'PMS', 'Custodian', 'POA'
      ));
  END IF;
END $$;

INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order)
VALUES
  ('Minor', 'Single', 'client', 'primary', 'extra_document', 'School ID / Birth Certificate / Passport', TRUE, FALSE, FALSE, 1000),
  ('NRI', 'Single', 'client', 'primary', 'extra_document', 'Nationality Certificate / Electricity Bill / Utility Bill / SSN or TIN / Others', TRUE, FALSE, FALSE, 1000),
  ('Individual', 'Single', 'client', 'primary', 'extra_document', 'Other Supporting Document', TRUE, FALSE, FALSE, 1000),
  ('Individual', 'Joint', 'client', 'primary', 'extra_document', 'Other Supporting Document', TRUE, FALSE, FALSE, 1000),
  ('Individual', 'Anyone or Survivor', 'client', 'primary', 'extra_document', 'Other Supporting Document', TRUE, FALSE, FALSE, 1000)
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET
  label = EXCLUDED.label,
  is_document = TRUE,
  is_data_point = FALSE,
  is_mandatory = FALSE,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();
