-- Allow admins to delete selected audit history rows from the CRM audit page.
-- Deletions are still recorded by the server API as a new audit entry.

DROP POLICY IF EXISTS "Admins can delete audit logs" ON audit_logs;
CREATE POLICY "Admins can delete audit logs" ON audit_logs
  FOR DELETE USING (public.is_admin());
