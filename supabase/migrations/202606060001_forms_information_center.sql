-- Forms Information Center.
-- Stores official external information-center URLs only. No forms or PDFs are
-- downloaded or stored by this module.

CREATE TABLE IF NOT EXISTS forms_information_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  organization_type TEXT NOT NULL DEFAULT 'AMC',
  forms_url TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  logo_url TEXT,
  last_verified_at TIMESTAMPTZ,
  verification_status TEXT DEFAULT 'unknown',
  last_http_status INTEGER,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forms_link_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES forms_information_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, link_id)
);

CREATE TABLE IF NOT EXISTS forms_link_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES forms_information_links(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'forms_information_links_type_check'
  ) THEN
    ALTER TABLE forms_information_links ADD CONSTRAINT forms_information_links_type_check
      CHECK (organization_type IN ('RTA', 'AMC', 'Other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'forms_information_links_health_check'
  ) THEN
    ALTER TABLE forms_information_links ADD CONSTRAINT forms_information_links_health_check
      CHECK (verification_status IN ('healthy', 'redirected', 'broken', 'unknown'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS forms_information_links_updated_at ON forms_information_links;
CREATE TRIGGER forms_information_links_updated_at
  BEFORE UPDATE ON forms_information_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_forms_information_links_type_order
  ON forms_information_links(organization_type, display_order, display_name);
CREATE INDEX IF NOT EXISTS idx_forms_information_links_active
  ON forms_information_links(active);
CREATE INDEX IF NOT EXISTS idx_forms_information_links_health
  ON forms_information_links(verification_status, last_verified_at);
CREATE INDEX IF NOT EXISTS idx_forms_link_favorites_user
  ON forms_link_favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_link_activity_user_opened
  ON forms_link_activity(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_link_activity_link
  ON forms_link_activity(link_id, opened_at DESC);

ALTER TABLE forms_information_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms_link_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms_link_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM users can view forms links" ON forms_information_links;
CREATE POLICY "CRM users can view forms links" ON forms_information_links
  FOR SELECT USING (
    public.is_admin()
    OR (public.is_operations() AND active = TRUE)
  );

DROP POLICY IF EXISTS "Admins can create forms links" ON forms_information_links;
CREATE POLICY "Admins can create forms links" ON forms_information_links
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update forms links" ON forms_information_links;
CREATE POLICY "Admins can update forms links" ON forms_information_links
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete forms links" ON forms_information_links;
CREATE POLICY "Admins can delete forms links" ON forms_information_links
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own forms favorites" ON forms_link_favorites;
CREATE POLICY "Users can view own forms favorites" ON forms_link_favorites
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own forms favorites" ON forms_link_favorites;
CREATE POLICY "Users can create own forms favorites" ON forms_link_favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own forms favorites" ON forms_link_favorites;
CREATE POLICY "Users can delete own forms favorites" ON forms_link_favorites
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own forms activity" ON forms_link_activity;
CREATE POLICY "Users can view own forms activity" ON forms_link_activity
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own forms activity" ON forms_link_activity;
CREATE POLICY "Users can create own forms activity" ON forms_link_activity
  FOR INSERT WITH CHECK (user_id = auth.uid());

INSERT INTO forms_information_links
  (display_name, slug, organization_type, forms_url, description, display_order)
VALUES
  ('KFintech', 'kfintech', 'RTA', 'https://mfs.kfintech.com/mfs/Generalpages/Download%20Forms.aspx?frm=iC', 'RTA service-request and mutual fund forms.', 10),
  ('CAMS', 'cams', 'RTA', 'https://www.camsonline.com/Investors/Service-requests/Service-Request-Forms', 'RTA service-request forms for CAMS-serviced funds.', 20),
  ('DSP Mutual Fund', 'dsp-mutual-fund', 'AMC', 'https://www.dspim.com/downloads?category=Forms&sub_category=Application%20Forms', 'Official DSP Mutual Fund forms and applications.', 30),
  ('Quant Mutual Fund', 'quant-mutual-fund', 'AMC', 'https://www.quantmutual.com/downloads/forms', 'Official Quant Mutual Fund forms.', 40),
  ('Motilal Oswal Mutual Fund', 'motilal-oswal-mutual-fund', 'AMC', 'https://www.motilaloswalmf.com/downloads/forms', 'Official Motilal Oswal Mutual Fund forms.', 50),
  ('Bandhan Mutual Fund', 'bandhan-mutual-fund', 'AMC', 'https://bandhanmutual.com/downloads/forms-for-investor', 'Official Bandhan Mutual Fund investor forms.', 60),
  ('Invesco Mutual Fund', 'invesco-mutual-fund', 'AMC', 'https://invescomutualfund.com/literature-and-form?tab=Forms', 'Official Invesco Mutual Fund forms.', 70),
  ('Nippon India Mutual Fund', 'nippon-india-mutual-fund', 'AMC', 'https://mf.nipponindiaim.com/investor-service/downloads/forms', 'Official Nippon India Mutual Fund forms.', 80),
  ('PGIM India Mutual Fund', 'pgim-india-mutual-fund', 'AMC', 'https://www.pgimindia.com/mutual-funds/forms-and-product-updates/Other', 'Official PGIM India Mutual Fund forms.', 90),
  ('Kotak Mutual Fund', 'kotak-mutual-fund', 'AMC', 'https://www.kotakmf.com/Information/forms-and-downloads', 'Official Kotak Mutual Fund forms and downloads.', 100),
  ('HDFC Mutual Fund', 'hdfc-mutual-fund', 'AMC', 'https://www.hdfcfund.com/services/forms', 'Official HDFC Mutual Fund service forms.', 110),
  ('HSBC Mutual Fund', 'hsbc-mutual-fund', 'AMC', 'https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources#&module-17=1', 'Official HSBC Mutual Fund investor resources.', 120),
  ('PPFAS / Parag Parikh Mutual Fund', 'ppfas-parag-parikh-mutual-fund', 'AMC', 'https://amc.ppfas.com/downloads/index.php', 'Official PPFAS and Parag Parikh Mutual Fund downloads.', 130),
  ('ICICI Prudential Mutual Fund', 'icici-prudential-mutual-fund', 'AMC', 'https://www.icicipruamc.com/media-center/downloads', 'Official ICICI Prudential Mutual Fund downloads.', 140),
  ('Axis Mutual Fund', 'axis-mutual-fund', 'AMC', 'https://www.axismf.com/downloads', 'Official Axis Mutual Fund forms and downloads.', 150),
  ('Mirae Asset Mutual Fund', 'mirae-asset-mutual-fund', 'AMC', 'https://www.miraeassetmf.co.in/downloads/forms', 'Official Mirae Asset Mutual Fund forms.', 160),
  ('Canara Robeco Mutual Fund', 'canara-robeco-mutual-fund', 'AMC', 'https://www.canararobeco.com/documents/forms-downloads/forms-information-documents/forms/service-forms-for-investors/', 'Official Canara Robeco Mutual Fund service forms.', 170),
  ('Baroda BNP Paribas Mutual Fund', 'baroda-bnp-paribas-mutual-fund', 'AMC', 'https://www.barodabnpparibasmf.in/downloads/application-forms', 'Official Baroda BNP Paribas Mutual Fund application forms.', 180),
  ('Edelweiss Mutual Fund', 'edelweiss-mutual-fund', 'AMC', 'https://www.edelweissmf.com/downloads/forms', 'Official Edelweiss Mutual Fund forms.', 190),
  ('Sundaram Mutual Fund', 'sundaram-mutual-fund', 'AMC', 'https://www.sundarammutual.com/downloads', 'Official Sundaram Mutual Fund downloads.', 200),
  ('WhiteOak Capital Mutual Fund', 'whiteoak-capital-mutual-fund', 'AMC', 'https://mf.whiteoakamc.com/resources?resource-type=downloads&category=forms&page=1', 'Official WhiteOak Capital Mutual Fund forms.', 210),
  ('SBI Mutual Fund', 'sbi-mutual-fund', 'AMC', 'https://www.sbimf.com/forms', 'Official SBI Mutual Fund forms.', 220),
  ('JM Financial Mutual Fund', 'jm-financial-mutual-fund', 'AMC', 'https://www.jmfinancialmf.com/downloads/Forms/Select-Sub-Category', 'Official JM Financial Mutual Fund forms.', 230),
  ('Franklin Templeton Mutual Fund', 'franklin-templeton-mutual-fund', 'AMC', 'https://www.franklintempletonindia.com/downloads/forms-and-instructions', 'Official Franklin Templeton Mutual Fund forms and instructions.', 240)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  organization_type = EXCLUDED.organization_type,
  forms_url = EXCLUDED.forms_url,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
