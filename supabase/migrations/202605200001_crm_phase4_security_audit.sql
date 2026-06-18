-- Phase 4: role-aware CRM permissions, audit logging, and document security.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS old_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

UPDATE audit_logs SET old_value = old_values WHERE old_value IS NULL AND old_values IS NOT NULL;
UPDATE audit_logs SET new_value = new_values WHERE new_value IS NULL AND new_values IS NOT NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_status_check'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT documents_status_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_documents_status_check'
  ) THEN
    ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
  END IF;
END $$;

ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('Pending upload', 'Uploaded', 'Parsed', 'Under review', 'Verified', 'Rejected', 'Exception approved', 'Approved', 'Exception'));

ALTER TABLE client_documents ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('Pending upload', 'Uploaded', 'Parsed', 'Under review', 'Verified', 'Rejected', 'Exception approved', 'Approved', 'Exception'));

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.is_operations()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'operations', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.can_access_client(target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = target_client_id
        AND c.operations_owner = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM tasks t
      JOIN task_assignments ta ON ta.task_id = t.id
      WHERE t.client_id = target_client_id
        AND ta.user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    row_id := NEW.id;
  ELSE
    row_id := OLD.id;
  END IF;

  INSERT INTO audit_logs (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    metadata
  )
  VALUES (
    auth.uid(),
    public.current_user_role(),
    lower(TG_OP),
    TG_TABLE_NAME,
    row_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    jsonb_build_object('source', 'rls_trigger')
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_clients_changes ON clients;
CREATE TRIGGER audit_clients_changes
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS audit_documents_changes ON documents;
CREATE TRIGGER audit_documents_changes
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS audit_client_documents_changes ON client_documents;
CREATE TRIGGER audit_client_documents_changes
  AFTER INSERT OR UPDATE OR DELETE ON client_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

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
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins can manage clients" ON clients;
CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can view allowed clients" ON clients;
CREATE POLICY "Operations can view allowed clients" ON clients
  FOR SELECT USING (public.can_access_client(id));

DROP POLICY IF EXISTS "Allowed users can view holders" ON client_holders;
CREATE POLICY "Allowed users can view holders" ON client_holders
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can manage holders" ON client_holders;
CREATE POLICY "Admins can manage holders" ON client_holders
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allowed users can view nominees" ON client_nominees;
CREATE POLICY "Allowed users can view nominees" ON client_nominees
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can manage nominees" ON client_nominees;
CREATE POLICY "Admins can manage nominees" ON client_nominees
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allowed users can view guardians" ON client_guardians;
CREATE POLICY "Allowed users can view guardians" ON client_guardians
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can manage guardians" ON client_guardians;
CREATE POLICY "Admins can manage guardians" ON client_guardians
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allowed users can view bank accounts" ON client_bank_accounts;
CREATE POLICY "Allowed users can view bank accounts" ON client_bank_accounts
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins can manage bank accounts" ON client_bank_accounts;
CREATE POLICY "Admins can manage bank accounts" ON client_bank_accounts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view document requirements" ON document_requirements;
CREATE POLICY "Authenticated users can view document requirements" ON document_requirements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage document requirements" ON document_requirements;
CREATE POLICY "Admins can manage document requirements" ON document_requirements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allowed users can view documents" ON documents;
CREATE POLICY "Allowed users can view documents" ON documents
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins and allowed operations can upload documents" ON documents;
CREATE POLICY "Admins and allowed operations can upload documents" ON documents
  FOR INSERT WITH CHECK (public.is_admin() OR (public.is_operations() AND public.can_access_client(client_id)));

DROP POLICY IF EXISTS "Admins can update documents" ON documents;
CREATE POLICY "Admins can update documents" ON documents
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can update unlocked documents" ON documents;
CREATE POLICY "Operations can update unlocked documents" ON documents
  FOR UPDATE
  USING (public.is_operations() AND public.can_access_client(client_id) AND status NOT IN ('Verified', 'Exception approved'))
  WITH CHECK (public.is_operations() AND public.can_access_client(client_id) AND status NOT IN ('Verified', 'Exception approved'));

DROP POLICY IF EXISTS "Admins can delete documents" ON documents;
CREATE POLICY "Admins can delete documents" ON documents
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Allowed users can view client documents" ON client_documents;
CREATE POLICY "Allowed users can view client documents" ON client_documents
  FOR SELECT USING (public.can_access_client(client_id));

DROP POLICY IF EXISTS "Admins and allowed operations can upload client documents" ON client_documents;
CREATE POLICY "Admins and allowed operations can upload client documents" ON client_documents
  FOR INSERT WITH CHECK (public.is_admin() OR (public.is_operations() AND public.can_access_client(client_id)));

DROP POLICY IF EXISTS "Admins can update client documents" ON client_documents;
CREATE POLICY "Admins can update client documents" ON client_documents
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can update unlocked client documents" ON client_documents;
CREATE POLICY "Operations can update unlocked client documents" ON client_documents
  FOR UPDATE
  USING (public.is_operations() AND public.can_access_client(client_id) AND status NOT IN ('Verified', 'Exception approved'))
  WITH CHECK (public.is_operations() AND public.can_access_client(client_id) AND status NOT IN ('Verified', 'Exception approved'));

DROP POLICY IF EXISTS "Admins can delete client documents" ON client_documents;
CREATE POLICY "Admins can delete client documents" ON client_documents
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;

DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_client_documents_uploaded_by ON client_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Allowed users can read client document files" ON storage.objects;
CREATE POLICY "Allowed users can read client document files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-documents'
    AND (
      public.is_admin()
      OR (
        public.is_operations()
        AND public.can_access_client((storage.foldername(name))[1]::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "Allowed users can upload client document files" ON storage.objects;
CREATE POLICY "Allowed users can upload client document files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      public.is_admin()
      OR (
        public.is_operations()
        AND public.can_access_client((storage.foldername(name))[1]::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "Allowed users can replace client document files" ON storage.objects;
CREATE POLICY "Allowed users can replace client document files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'client-documents'
    AND (
      public.is_admin()
      OR (
        public.is_operations()
        AND public.can_access_client((storage.foldername(name))[1]::uuid)
      )
    )
  ) WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      public.is_admin()
      OR (
        public.is_operations()
        AND public.can_access_client((storage.foldername(name))[1]::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete client document files" ON storage.objects;
CREATE POLICY "Admins can delete client document files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'client-documents'
    AND public.is_admin()
  );
