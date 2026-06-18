-- ================================================================
-- CRM PHASE 1 FOUNDATION
-- Back-office CRM onboarding data model for PRD-aligned client setup.
--
-- This migration is intentionally additive where possible. Existing data is
-- test data, but keeping additive DDL makes local/dev Supabase environments
-- easier to upgrade repeatedly.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared timestamp trigger helper.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- CLIENTS
-- Keeps existing manual onboarding fields and adds PRD-level fields.
-- ================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  gender TEXT,
  marital_status TEXT,
  salary_range TEXT,
  occupation TEXT,
  citizenship TEXT DEFAULT 'INDIAN',
  citizenship_country TEXT,
  residential_status TEXT,
  nominee_name TEXT,
  nominee_relation TEXT,
  nominee_share NUMERIC(5,2),
  nominee_email TEXT,
  nominee_mobile TEXT,
  kyc_status TEXT DEFAULT 'Registered',
  document_progress INTEGER DEFAULT 0,
  parsed_kyc JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_code TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'Individual',
  ADD COLUMN IF NOT EXISTS holding_pattern TEXT DEFAULT 'Single',
  ADD COLUMN IF NOT EXISTS account_operation_mode TEXT,
  ADD COLUMN IF NOT EXISTS client_category TEXT,
  ADD COLUMN IF NOT EXISTS client_source TEXT,
  ADD COLUMN IF NOT EXISTS relationship_manager TEXT,
  ADD COLUMN IF NOT EXISTS operations_owner UUID,
  ADD COLUMN IF NOT EXISTS alternate_mobile TEXT,
  ADD COLUMN IF NOT EXISTS alternate_email TEXT,
  ADD COLUMN IF NOT EXISTS residential_address TEXT,
  ADD COLUMN IF NOT EXISTS correspondence_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS pin_code TEXT,
  ADD COLUMN IF NOT EXISTS investment_objective TEXT,
  ADD COLUMN IF NOT EXISTS risk_category TEXT,
  ADD COLUMN IF NOT EXISTS appraisal_bonus_date DATE,
  ADD COLUMN IF NOT EXISTS has_insurance TEXT DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS insurance_through_company TEXT DEFAULT 'Not Applicable',
  ADD COLUMN IF NOT EXISTS insurance_provider_name TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_type TEXT,
  ADD COLUMN IF NOT EXISTS insurance_renewal_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_remarks TEXT,
  ADD COLUMN IF NOT EXISTS foreign_address TEXT,
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS passport_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS nri_bank_account_type TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Existing dev/test schemas may have nominee_share as text because the old
-- form submitted it as an input string. Normalize it before adding checks.
ALTER TABLE clients
  ALTER COLUMN nominee_share TYPE NUMERIC(5,2)
  USING CASE
    WHEN nominee_share::text ~ '^[0-9]+(\.[0-9]+)?$' THEN nominee_share::text::numeric
    ELSE NULL
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_tax_status_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_tax_status_check
      CHECK (tax_status IN ('Individual', 'Minor', 'NRI', 'HUF', 'Company', 'Partnership', 'LLP', 'Trust', 'Others'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_holding_pattern_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_holding_pattern_check
      CHECK (holding_pattern IN ('Single', 'Joint', 'Anyone or Survivor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_nominee_share_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_nominee_share_check
      CHECK (nominee_share IS NULL OR (nominee_share >= 0 AND nominee_share <= 100));
  END IF;
END $$;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- HOLDERS
-- One client can have primary, second, and third holder records.
-- ================================================================

CREATE TABLE IF NOT EXISTS client_holders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  holder_type TEXT NOT NULL,
  holder_order INTEGER NOT NULL CHECK (holder_order BETWEEN 1 AND 3),
  full_name TEXT,
  father_spouse_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  pan TEXT,
  aadhaar_last_four TEXT,
  ckyc_number TEXT,
  kyc_status TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  occupation TEXT,
  annual_income_range TEXT,
  political_exposure_status TEXT,
  fatca_crs_details JSONB DEFAULT '{}'::jsonb,
  signature_specimen_url TEXT,
  document_verification_status TEXT DEFAULT 'Pending',
  holder_remarks TEXT,
  foreign_address TEXT,
  passport_number TEXT,
  passport_expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, holder_order),
  UNIQUE (client_id, holder_type)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_holders_holder_type_check'
  ) THEN
    ALTER TABLE client_holders ADD CONSTRAINT client_holders_holder_type_check
      CHECK (holder_type IN ('primary', 'second', 'third'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS client_holders_updated_at ON client_holders;
CREATE TRIGGER client_holders_updated_at
  BEFORE UPDATE ON client_holders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- NOMINEES
-- Up to three nominees per client.
-- ================================================================

CREATE TABLE IF NOT EXISTS client_nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nominee_order INTEGER NOT NULL CHECK (nominee_order BETWEEN 1 AND 3),
  name TEXT,
  relationship TEXT,
  date_of_birth DATE,
  guardian_name TEXT,
  percentage NUMERIC(5,2),
  mobile TEXT,
  email TEXT,
  address TEXT,
  pan TEXT,
  aadhaar_last_four TEXT,
  nomination_opted BOOLEAN DEFAULT TRUE,
  opted_out_reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, nominee_order),
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

DROP TRIGGER IF EXISTS client_nominees_updated_at ON client_nominees;
CREATE TRIGGER client_nominees_updated_at
  BEFORE UPDATE ON client_nominees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- GUARDIANS
-- Used for Minor onboarding; kept one guardian per client for Phase 1.
-- ================================================================

CREATE TABLE IF NOT EXISTS client_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  minor_holder_id UUID REFERENCES client_holders(id) ON DELETE SET NULL,
  full_name TEXT,
  relationship TEXT,
  pan TEXT,
  aadhaar_last_four TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  date_of_birth DATE,
  kyc_status TEXT,
  document_verification_status TEXT DEFAULT 'Pending',
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id)
);

ALTER TABLE client_guardians
  ALTER COLUMN full_name DROP NOT NULL;

DROP TRIGGER IF EXISTS client_guardians_updated_at ON client_guardians;
CREATE TRIGGER client_guardians_updated_at
  BEFORE UPDATE ON client_guardians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- BANK ACCOUNTS
-- Client/account-level bank model with optional holder linkage.
-- ================================================================

CREATE TABLE IF NOT EXISTS client_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  holder_id UUID REFERENCES client_holders(id) ON DELETE SET NULL,
  bank_name TEXT,
  branch TEXT,
  account_holder_name TEXT,
  account_number TEXT,
  account_type TEXT,
  nri_account_type TEXT,
  ifsc_code TEXT,
  micr_code TEXT,
  cancelled_cheque_uploaded BOOLEAN DEFAULT FALSE,
  bank_verification_status TEXT DEFAULT 'Pending',
  is_primary BOOLEAN DEFAULT FALSE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_bank_accounts_nri_account_type_check'
  ) THEN
    ALTER TABLE client_bank_accounts ADD CONSTRAINT client_bank_accounts_nri_account_type_check
      CHECK (nri_account_type IS NULL OR nri_account_type IN ('NRE', 'NRO', 'FCNR', 'Other'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS client_bank_accounts_updated_at ON client_bank_accounts;
CREATE TRIGGER client_bank_accounts_updated_at
  BEFORE UPDATE ON client_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- DOCUMENT REQUIREMENTS / RULES
-- Configurable rule table used by onboarding and document completeness.
-- ================================================================

CREATE TABLE IF NOT EXISTS document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_status TEXT NOT NULL,
  holding_pattern TEXT,
  owner_type TEXT NOT NULL,
  owner_role TEXT,
  requirement_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_document BOOLEAN DEFAULT TRUE,
  is_data_point BOOLEAN DEFAULT FALSE,
  is_mandatory BOOLEAN DEFAULT TRUE,
  applies_when JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_requirements_owner_type_check'
  ) THEN
    ALTER TABLE document_requirements ADD CONSTRAINT document_requirements_owner_type_check
      CHECK (owner_type IN ('holder', 'nominee', 'guardian', 'bank', 'client'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS document_requirements_updated_at ON document_requirements;
CREATE TRIGGER document_requirements_updated_at
  BEFORE UPDATE ON document_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Legacy/current document table retained for existing UI compatibility.
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS holder_id UUID REFERENCES client_holders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nominee_id UUID REFERENCES client_nominees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES client_guardians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES client_bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_type TEXT DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS requirement_key TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exception_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exception_reason TEXT;

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Canonical PRD document table for new work. Existing UI can migrate from
-- documents to client_documents in Phase 2 without losing current behavior.
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  holder_id UUID REFERENCES client_holders(id) ON DELETE SET NULL,
  nominee_id UUID REFERENCES client_nominees(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES client_guardians(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES client_bank_accounts(id) ON DELETE SET NULL,
  owner_type TEXT NOT NULL DEFAULT 'client',
  requirement_key TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT,
  storage_path TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size BIGINT,
  status TEXT DEFAULT 'Pending',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  exception_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  exception_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_documents_owner_type_check'
  ) THEN
    ALTER TABLE client_documents ADD CONSTRAINT client_documents_owner_type_check
      CHECK (owner_type IN ('client', 'holder', 'nominee', 'guardian', 'bank'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_documents_status_check'
  ) THEN
    ALTER TABLE client_documents ADD CONSTRAINT client_documents_status_check
      CHECK (status IN ('Pending', 'Uploaded', 'Approved', 'Rejected', 'Exception'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS client_documents_updated_at ON client_documents;
CREATE TRIGGER client_documents_updated_at
  BEFORE UPDATE ON client_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- BASIC AUDIT LOGS
-- Expanded logging hooks will be wired in later phases.
-- ================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_clients_tax_status ON clients(tax_status);
CREATE INDEX IF NOT EXISTS idx_clients_holding_pattern ON clients(holding_pattern);
CREATE INDEX IF NOT EXISTS idx_clients_mobile ON clients(mobile);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_client_holders_client_id ON client_holders(client_id);
CREATE INDEX IF NOT EXISTS idx_client_nominees_client_id ON client_nominees(client_id);
CREATE INDEX IF NOT EXISTS idx_client_guardians_client_id ON client_guardians(client_id);
CREATE INDEX IF NOT EXISTS idx_client_bank_accounts_client_id ON client_bank_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_document_requirements_lookup ON document_requirements(tax_status, holding_pattern, owner_type, owner_role);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);

-- ================================================================
-- RLS
-- Permissive authenticated policies for Phase 1 foundation. Later phases
-- should tighten these around admin/operations permissions and ownership.
-- ================================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clients',
    'client_holders',
    'client_nominees',
    'client_guardians',
    'client_bank_accounts',
    'document_requirements',
    'documents',
    'client_documents'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can manage %s" ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY "Authenticated users can manage %s" ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
      table_name,
      table_name
    );
  END LOOP;

  DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
  CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

  DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON audit_logs;
  CREATE POLICY "Authenticated users can view audit logs" ON audit_logs
    FOR SELECT USING (auth.role() = 'authenticated');
END $$;

-- ================================================================
-- DOCUMENT REQUIREMENT SEEDS
-- ================================================================

INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order)
VALUES
  -- Individual / Single - primary holder
  ('Individual', 'Single', 'holder', 'primary', 'pan_card', 'PAN Card', TRUE, FALSE, TRUE, 10),
  ('Individual', 'Single', 'holder', 'primary', 'aadhaar_card', 'Aadhaar Card', TRUE, FALSE, TRUE, 20),
  ('Individual', 'Single', 'bank', 'primary', 'cancelled_cheque', 'Cancelled Cheque', TRUE, FALSE, TRUE, 30),
  ('Individual', 'Single', 'holder', 'primary', 'email_id', 'Email ID', FALSE, TRUE, TRUE, 40),
  ('Individual', 'Single', 'holder', 'primary', 'phone_number', 'Phone Number', FALSE, TRUE, TRUE, 50),
  ('Individual', 'Single', 'holder', 'primary', 'passport_photo', 'Passport-size Photo', TRUE, FALSE, TRUE, 60),
  ('Individual', 'Single', 'holder', 'primary', 'signature', 'Signature', TRUE, FALSE, TRUE, 70),
  ('Individual', 'Single', 'nominee', 'any', 'pan_card', 'Nominee PAN Card', TRUE, FALSE, TRUE, 80),
  ('Individual', 'Single', 'nominee', 'any', 'aadhaar_card', 'Nominee Aadhaar Card', TRUE, FALSE, TRUE, 90),
  ('Individual', 'Single', 'nominee', 'any', 'email_id', 'Nominee Email ID', FALSE, TRUE, TRUE, 100),
  ('Individual', 'Single', 'nominee', 'any', 'phone_number', 'Nominee Phone Number', FALSE, TRUE, TRUE, 110),

  -- Minor
  ('Minor', 'Single', 'holder', 'primary', 'aadhaar_card', 'Minor Aadhaar Card', TRUE, FALSE, TRUE, 10),
  ('Minor', 'Single', 'bank', 'primary', 'cancelled_cheque', 'Cancelled Cheque', TRUE, FALSE, TRUE, 20),
  ('Minor', 'Single', 'holder', 'primary', 'email_id', 'Minor Email ID', FALSE, TRUE, TRUE, 30),
  ('Minor', 'Single', 'holder', 'primary', 'phone_number', 'Minor Phone Number', FALSE, TRUE, TRUE, 40),
  ('Minor', 'Single', 'holder', 'primary', 'passport_photo', 'Passport-size Photo', TRUE, FALSE, TRUE, 50),
  ('Minor', 'Single', 'holder', 'primary', 'signature', 'Signature', TRUE, FALSE, TRUE, 60),
  ('Minor', 'Single', 'guardian', 'primary', 'pan_card', 'Guardian PAN Card', TRUE, FALSE, TRUE, 70),
  ('Minor', 'Single', 'guardian', 'primary', 'aadhaar_card', 'Guardian Aadhaar Card', TRUE, FALSE, TRUE, 80),
  ('Minor', 'Single', 'guardian', 'primary', 'email_id', 'Guardian Email ID', FALSE, TRUE, TRUE, 90),
  ('Minor', 'Single', 'guardian', 'primary', 'phone_number', 'Guardian Phone Number', FALSE, TRUE, TRUE, 100),

  -- NRI
  ('NRI', 'Single', 'holder', 'primary', 'pan_card', 'PAN Card', TRUE, FALSE, TRUE, 10),
  ('NRI', 'Single', 'holder', 'primary', 'aadhaar_card', 'Aadhaar Card', TRUE, FALSE, TRUE, 20),
  ('NRI', 'Single', 'bank', 'primary', 'cancelled_cheque_nre_nro', 'Cancelled Cheque for NRE/NRO Account', TRUE, FALSE, TRUE, 30),
  ('NRI', 'Single', 'holder', 'primary', 'email_id', 'Email ID', FALSE, TRUE, TRUE, 40),
  ('NRI', 'Single', 'holder', 'primary', 'phone_number', 'Phone Number', FALSE, TRUE, TRUE, 50),
  ('NRI', 'Single', 'holder', 'primary', 'foreign_address', 'Foreign Address', FALSE, TRUE, TRUE, 60),
  ('NRI', 'Single', 'holder', 'primary', 'passport', 'Passport', TRUE, FALSE, TRUE, 70),
  ('NRI', 'Single', 'holder', 'primary', 'passport_photo', 'Passport-size Photo', TRUE, FALSE, TRUE, 80),
  ('NRI', 'Single', 'holder', 'primary', 'signature', 'Signature', TRUE, FALSE, TRUE, 90),
  ('NRI', 'Single', 'nominee', 'any', 'pan_card', 'Nominee PAN Card', TRUE, FALSE, TRUE, 100),
  ('NRI', 'Single', 'nominee', 'any', 'aadhaar_card', 'Nominee Aadhaar Card', TRUE, FALSE, TRUE, 110),
  ('NRI', 'Single', 'nominee', 'any', 'email_id', 'Nominee Email ID', FALSE, TRUE, TRUE, 120),
  ('NRI', 'Single', 'nominee', 'any', 'phone_number', 'Nominee Phone Number', FALSE, TRUE, TRUE, 130)
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET
  label = EXCLUDED.label,
  is_document = EXCLUDED.is_document,
  is_data_point = EXCLUDED.is_data_point,
  is_mandatory = EXCLUDED.is_mandatory,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();

-- Individual Joint / Anyone or Survivor holder requirements are generated
-- for primary, second, and third holders. Third-holder requirements are
-- evaluated only when a third holder exists.
WITH holder_roles AS (
  SELECT * FROM (VALUES ('primary', 1), ('second', 2), ('third', 3)) AS v(role, role_order)
),
holding_patterns AS (
  SELECT * FROM (VALUES ('Joint'), ('Anyone or Survivor')) AS v(pattern)
),
requirements AS (
  SELECT * FROM (VALUES
    ('pan_card', 'PAN Card', TRUE, FALSE, 10),
    ('aadhaar_card', 'Aadhaar Card', TRUE, FALSE, 20),
    ('email_id', 'Email ID', FALSE, TRUE, 30),
    ('phone_number', 'Phone Number', FALSE, TRUE, 40),
    ('passport_photo', 'Passport-size Photo', TRUE, FALSE, 50),
    ('signature', 'Signature', TRUE, FALSE, 60)
  ) AS v(requirement_key, label, is_document, is_data_point, sort_order)
)
INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, applies_when, sort_order)
SELECT
  'Individual',
  hp.pattern,
  'holder',
  hr.role,
  r.requirement_key,
  CASE
    WHEN hr.role = 'primary' THEN 'Primary Holder ' || r.label
    WHEN hr.role = 'second' THEN 'Second Holder ' || r.label
    ELSE 'Third Holder ' || r.label
  END,
  r.is_document,
  r.is_data_point,
  TRUE,
  CASE WHEN hr.role = 'third' THEN '{"holder_must_exist": true}'::jsonb ELSE '{}'::jsonb END,
  (hr.role_order * 100) + r.sort_order
FROM holding_patterns hp
CROSS JOIN holder_roles hr
CROSS JOIN requirements r
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET
  label = EXCLUDED.label,
  is_document = EXCLUDED.is_document,
  is_data_point = EXCLUDED.is_data_point,
  is_mandatory = EXCLUDED.is_mandatory,
  applies_when = EXCLUDED.applies_when,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();

WITH holder_roles AS (
  SELECT * FROM (VALUES ('primary', 1), ('second', 2), ('third', 3)) AS v(role, role_order)
),
holding_patterns AS (
  SELECT * FROM (VALUES ('Joint'), ('Anyone or Survivor')) AS v(pattern)
)
INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, applies_when, sort_order)
SELECT
  'Individual',
  hp.pattern,
  'bank',
  hr.role,
  'cancelled_cheque',
  CASE
    WHEN hr.role = 'primary' THEN 'Primary Holder Cancelled Cheque'
    WHEN hr.role = 'second' THEN 'Second Holder Cancelled Cheque'
    ELSE 'Third Holder Cancelled Cheque'
  END,
  TRUE,
  FALSE,
  TRUE,
  CASE WHEN hr.role = 'third' THEN '{"holder_must_exist": true}'::jsonb ELSE '{}'::jsonb END,
  (hr.role_order * 100) + 70
FROM holding_patterns hp
CROSS JOIN holder_roles hr
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET
  label = EXCLUDED.label,
  applies_when = EXCLUDED.applies_when,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();

WITH holding_patterns AS (
  SELECT * FROM (VALUES ('Joint'), ('Anyone or Survivor')) AS v(pattern)
),
requirements AS (
  SELECT * FROM (VALUES
    ('pan_card', 'Nominee PAN Card', TRUE, FALSE, 800),
    ('aadhaar_card', 'Nominee Aadhaar Card', TRUE, FALSE, 810),
    ('email_id', 'Nominee Email ID', FALSE, TRUE, 820),
    ('phone_number', 'Nominee Phone Number', FALSE, TRUE, 830)
  ) AS v(requirement_key, label, is_document, is_data_point, sort_order)
)
INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order)
SELECT
  'Individual',
  hp.pattern,
  'nominee',
  'any',
  r.requirement_key,
  r.label,
  r.is_document,
  r.is_data_point,
  TRUE,
  r.sort_order
FROM holding_patterns hp
CROSS JOIN requirements r
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET
  label = EXCLUDED.label,
  is_document = EXCLUDED.is_document,
  is_data_point = EXCLUDED.is_data_point,
  is_mandatory = EXCLUDED.is_mandatory,
  sort_order = EXCLUDED.sort_order,
  active = TRUE,
  updated_at = NOW();
