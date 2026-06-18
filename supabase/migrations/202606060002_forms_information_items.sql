-- Individual form links within each RTA/AMC directory entry.
-- These remain external links only; no form files are stored in the CRM.

CREATE TABLE IF NOT EXISTS forms_information_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES forms_information_links(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  form_url TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, form_url)
);

DROP TRIGGER IF EXISTS forms_information_items_updated_at ON forms_information_items;
CREATE TRIGGER forms_information_items_updated_at
  BEFORE UPDATE ON forms_information_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_forms_information_items_org
  ON forms_information_items(organization_id, active, display_order, form_name);

ALTER TABLE forms_information_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM users can view forms items" ON forms_information_items;
CREATE POLICY "CRM users can view forms items" ON forms_information_items
  FOR SELECT USING (
    public.is_admin()
    OR (
      public.is_operations()
      AND active = TRUE
      AND EXISTS (
        SELECT 1 FROM forms_information_links organization
        WHERE organization.id = organization_id AND organization.active = TRUE
      )
    )
  );

DROP POLICY IF EXISTS "Admins can create forms items" ON forms_information_items;
CREATE POLICY "Admins can create forms items" ON forms_information_items
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update forms items" ON forms_information_items;
CREATE POLICY "Admins can update forms items" ON forms_information_items
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete forms items" ON forms_information_items;
CREATE POLICY "Admins can delete forms items" ON forms_information_items
  FOR DELETE USING (public.is_admin());

-- Every organization begins with its official forms-directory page. Admins can
-- add direct links for commonly used forms from the Forms Information Center.
INSERT INTO forms_information_items
  (organization_id, form_name, category, form_url, description, display_order)
SELECT
  id,
  'All Official Forms',
  'Directory',
  forms_url,
  'Open the complete official forms and information-center page.',
  0
FROM forms_information_links
ON CONFLICT (organization_id, form_url) DO UPDATE SET
  form_name = EXCLUDED.form_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  active = TRUE,
  updated_at = NOW();
