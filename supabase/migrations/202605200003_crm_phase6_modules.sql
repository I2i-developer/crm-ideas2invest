-- ================================================================
-- CRM PHASE 6 MODULES
-- Company credentials, calculators, risk profiling, and insurance.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- COMPANY DETAILS / CREDENTIALS
-- ================================================================

CREATE TABLE IF NOT EXISTS company_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Ideas2Invest',
  arn TEXT,
  euin_details TEXT,
  registered_address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  login_url TEXT,
  username TEXT,
  encrypted_secret JSONB,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CALCULATORS
-- ================================================================

CREATE TABLE IF NOT EXISTS calculators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Financial Planning',
  description TEXT,
  url TEXT,
  embed_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name)
);

-- ================================================================
-- RISK PROFILING
-- ================================================================

CREATE TABLE IF NOT EXISTS risk_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES risk_questionnaires(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_set JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_profile_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  questionnaire_id UUID REFERENCES risk_questionnaires(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Draft',
  total_score NUMERIC(8,2) DEFAULT 0,
  risk_category TEXT,
  assessment_date DATE DEFAULT CURRENT_DATE,
  review_date DATE,
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_profile_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES risk_profile_assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES risk_questions(id) ON DELETE CASCADE,
  answer_label TEXT,
  score NUMERIC(8,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, question_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'risk_profile_assessments_status_check'
  ) THEN
    ALTER TABLE risk_profile_assessments ADD CONSTRAINT risk_profile_assessments_status_check
      CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'risk_profile_assessments_category_check'
  ) THEN
    ALTER TABLE risk_profile_assessments ADD CONSTRAINT risk_profile_assessments_category_check
      CHECK (risk_category IS NULL OR risk_category IN ('Conservative', 'Moderately Conservative', 'Balanced', 'Growth', 'Aggressive'));
  END IF;
END $$;

-- ================================================================
-- INSURANCE
-- ================================================================

CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  policy_type TEXT,
  insurance_company TEXT,
  policy_number TEXT,
  premium_amount NUMERIC(14,2),
  premium_frequency TEXT,
  renewal_date DATE,
  sum_assured NUMERIC(14,2),
  nominee TEXT,
  through_company BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'Active',
  remarks TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'insurance_policies_status_check'
  ) THEN
    ALTER TABLE insurance_policies ADD CONSTRAINT insurance_policies_status_check
      CHECK (status IN ('Active', 'Lapsed', 'Closed', 'Pending'));
  END IF;
END $$;

-- Keep client-level insurance fields from Phase 1, but make policy records canonical.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ================================================================
-- TRIGGERS / INDEXES
-- ================================================================

DROP TRIGGER IF EXISTS company_details_updated_at ON company_details;
CREATE TRIGGER company_details_updated_at BEFORE UPDATE ON company_details
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS company_credentials_updated_at ON company_credentials;
CREATE TRIGGER company_credentials_updated_at BEFORE UPDATE ON company_credentials
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS calculators_updated_at ON calculators;
CREATE TRIGGER calculators_updated_at BEFORE UPDATE ON calculators
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS risk_questionnaires_updated_at ON risk_questionnaires;
CREATE TRIGGER risk_questionnaires_updated_at BEFORE UPDATE ON risk_questionnaires
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS risk_questions_updated_at ON risk_questions;
CREATE TRIGGER risk_questions_updated_at BEFORE UPDATE ON risk_questions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS risk_profile_assessments_updated_at ON risk_profile_assessments;
CREATE TRIGGER risk_profile_assessments_updated_at BEFORE UPDATE ON risk_profile_assessments
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS risk_profile_answers_updated_at ON risk_profile_answers;
CREATE TRIGGER risk_profile_answers_updated_at BEFORE UPDATE ON risk_profile_answers
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS insurance_policies_updated_at ON insurance_policies;
CREATE TRIGGER insurance_policies_updated_at BEFORE UPDATE ON insurance_policies
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_company_credentials_active ON company_credentials(active);
CREATE INDEX IF NOT EXISTS idx_calculators_active_order ON calculators(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_risk_profile_assessments_client ON risk_profile_assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_risk_profile_assessments_status ON risk_profile_assessments(status);
CREATE INDEX IF NOT EXISTS idx_risk_profile_answers_assessment ON risk_profile_answers(assessment_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_client ON insurance_policies(client_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_renewal ON insurance_policies(renewal_date);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_status ON insurance_policies(status);

-- ================================================================
-- RLS
-- ================================================================

ALTER TABLE company_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculators ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profile_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profile_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage company details" ON company_details;
CREATE POLICY "Admins can manage company details" ON company_details
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage company credentials" ON company_credentials;
CREATE POLICY "Admins can manage company credentials" ON company_credentials
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view active calculators" ON calculators;
CREATE POLICY "Authenticated users can view active calculators" ON calculators
  FOR SELECT USING (auth.role() = 'authenticated' AND (is_active = TRUE OR public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage calculators" ON calculators;
CREATE POLICY "Admins can manage calculators" ON calculators
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view risk questionnaires" ON risk_questionnaires;
CREATE POLICY "Authenticated users can view risk questionnaires" ON risk_questionnaires
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage risk questionnaires" ON risk_questionnaires;
CREATE POLICY "Admins can manage risk questionnaires" ON risk_questionnaires
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view risk questions" ON risk_questions;
CREATE POLICY "Authenticated users can view risk questions" ON risk_questions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage risk questions" ON risk_questions;
CREATE POLICY "Admins can manage risk questions" ON risk_questions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Role-aware risk assessments select" ON risk_profile_assessments;
CREATE POLICY "Role-aware risk assessments select" ON risk_profile_assessments
  FOR SELECT USING (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Role-aware risk assessments insert" ON risk_profile_assessments;
CREATE POLICY "Role-aware risk assessments insert" ON risk_profile_assessments
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (public.can_access_client(client_id) AND status <> 'Approved')
  );

DROP POLICY IF EXISTS "Role-aware risk assessments update" ON risk_profile_assessments;
CREATE POLICY "Role-aware risk assessments update" ON risk_profile_assessments
  FOR UPDATE USING (public.is_admin() OR public.can_access_client(client_id))
  WITH CHECK (
    public.is_admin()
    OR (public.can_access_client(client_id) AND status <> 'Approved' AND approved_by IS NULL AND approved_at IS NULL)
  );

DROP POLICY IF EXISTS "Risk answers visible through assessment" ON risk_profile_answers;
CREATE POLICY "Risk answers visible through assessment" ON risk_profile_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM risk_profile_assessments rpa
      WHERE rpa.id = assessment_id
      AND (public.is_admin() OR public.can_access_client(rpa.client_id))
    )
  );

DROP POLICY IF EXISTS "Risk answers writable through assessment" ON risk_profile_answers;
CREATE POLICY "Risk answers writable through assessment" ON risk_profile_answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM risk_profile_assessments rpa
      WHERE rpa.id = assessment_id
      AND (public.is_admin() OR public.can_access_client(rpa.client_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM risk_profile_assessments rpa
      WHERE rpa.id = assessment_id
      AND (public.is_admin() OR public.can_access_client(rpa.client_id))
    )
  );

DROP POLICY IF EXISTS "Role-aware insurance select" ON insurance_policies;
CREATE POLICY "Role-aware insurance select" ON insurance_policies
  FOR SELECT USING (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Role-aware insurance insert" ON insurance_policies;
CREATE POLICY "Role-aware insurance insert" ON insurance_policies
  FOR INSERT WITH CHECK (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Role-aware insurance update" ON insurance_policies;
CREATE POLICY "Role-aware insurance update" ON insurance_policies
  FOR UPDATE USING (public.is_admin() OR public.can_access_client(client_id))
  WITH CHECK (public.is_admin() OR public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can delete insurance" ON insurance_policies;
CREATE POLICY "Admins can delete insurance" ON insurance_policies
  FOR DELETE USING (public.is_admin());

-- ================================================================
-- SEEDS
-- ================================================================

INSERT INTO company_details (company_name)
SELECT 'Ideas2Invest'
WHERE NOT EXISTS (SELECT 1 FROM company_details);

INSERT INTO calculators (name, category, description, url, display_order)
VALUES
  ('Reverse Calculation Calculator', 'Planning', 'Back-calculate investment needs from a target value.', '#', 10),
  ('Mutual Fund Calculator', 'Mutual Funds', 'Estimate mutual fund investment outcomes.', '#', 20),
  ('SIP Calculator', 'Mutual Funds', 'Project SIP corpus and contribution needs.', '#', 30),
  ('SWP Calculator', 'Mutual Funds', 'Estimate withdrawals and remaining corpus.', '#', 40),
  ('STP Calculator', 'Mutual Funds', 'Plan systematic transfer flows.', '#', 50),
  ('Mutual + Ace Calculator', 'Mutual Funds', 'Combined planning calculator for mutual fund workflows.', '#', 60),
  ('Lumpsum Calculator', 'Mutual Funds', 'Project lumpsum investment growth.', '#', 70),
  ('Goal Planning Calculator', 'Planning', 'Plan investments against life goals.', '#', 80),
  ('Retirement Calculator', 'Planning', 'Estimate retirement corpus requirements.', '#', 90),
  ('Insurance Need Calculator', 'Insurance', 'Estimate life insurance cover requirements.', '#', 100)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

WITH questionnaire AS (
  INSERT INTO risk_questionnaires (title, description, version, is_active)
  SELECT 'Default Client Risk Profile', 'Expandable default questionnaire for CRM risk profiling.', 1, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM risk_questionnaires WHERE is_active = TRUE)
  RETURNING id
),
active_questionnaire AS (
  SELECT id
  FROM (
    SELECT id, 1 AS source_order FROM questionnaire
    UNION ALL
    SELECT id, 2 AS source_order FROM risk_questionnaires WHERE is_active = TRUE
  ) available
  ORDER BY source_order
  LIMIT 1
),
questions AS (
  SELECT * FROM (VALUES
    (10, 'What is the client investment horizon?',
      '[{"label":"Less than 1 year","score":1},{"label":"1-3 years","score":2},{"label":"3-5 years","score":3},{"label":"5-7 years","score":4},{"label":"More than 7 years","score":5}]'::jsonb),
    (20, 'How would the client react to a 15% temporary portfolio fall?',
      '[{"label":"Exit immediately","score":1},{"label":"Reduce exposure","score":2},{"label":"Wait and review","score":3},{"label":"Stay invested","score":4},{"label":"Invest more","score":5}]'::jsonb),
    (30, 'What is the primary investment objective?',
      '[{"label":"Capital protection","score":1},{"label":"Regular income","score":2},{"label":"Balanced growth","score":3},{"label":"Long-term growth","score":4},{"label":"High growth","score":5}]'::jsonb),
    (40, 'How stable is the client income?',
      '[{"label":"Unstable","score":1},{"label":"Somewhat unstable","score":2},{"label":"Stable","score":3},{"label":"Very stable","score":4},{"label":"Multiple stable sources","score":5}]'::jsonb),
    (50, 'What is the client prior market experience?',
      '[{"label":"None","score":1},{"label":"Deposits only","score":2},{"label":"Basic mutual funds","score":3},{"label":"Equity/mutual funds","score":4},{"label":"Advanced market products","score":5}]'::jsonb)
  ) AS v(sort_order, question_text, option_set)
)
INSERT INTO risk_questions (questionnaire_id, sort_order, question_text, option_set)
SELECT aq.id, q.sort_order, q.question_text, q.option_set
FROM active_questionnaire aq
CROSS JOIN questions q
WHERE NOT EXISTS (
  SELECT 1 FROM risk_questions rq
  WHERE rq.questionnaire_id = aq.id
  AND rq.sort_order = q.sort_order
);
