-- Make the shared updated_at trigger safe even if an older/dev table has the
-- trigger attached before the updated_at column exists.

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA
      AND table_name = TG_TABLE_NAME
      AND column_name = 'updated_at'
  ) THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', NOW()));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS client_holders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS client_nominees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS client_guardians ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS client_bank_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS client_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Seed front/back Aadhaar requirements for environments using DB-backed rules.
INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order)
SELECT tax_status, holding_pattern, owner_type, owner_role, 'aadhaar_front', REPLACE(label, 'Aadhaar Card', 'Aadhaar Front'), TRUE, FALSE, is_mandatory, sort_order
FROM document_requirements
WHERE requirement_key = 'aadhaar_card'
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET label = EXCLUDED.label, active = TRUE, updated_at = NOW();

INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order)
SELECT tax_status, holding_pattern, owner_type, owner_role, 'aadhaar_back', REPLACE(label, 'Aadhaar Card', 'Aadhaar Back'), TRUE, FALSE, is_mandatory, sort_order + 1
FROM document_requirements
WHERE requirement_key = 'aadhaar_card'
  AND owner_type <> 'nominee'
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET label = EXCLUDED.label, active = TRUE, updated_at = NOW();

UPDATE document_requirements
SET active = FALSE, updated_at = NOW()
WHERE owner_type = 'nominee'
  AND requirement_key IN ('aadhaar_back', 'aadhaar_card');
