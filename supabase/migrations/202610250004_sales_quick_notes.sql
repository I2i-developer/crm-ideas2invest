-- Sales quick notes reuse the existing editor with own-note access only.
-- Existing Operations/Admin policies and saved notes are unchanged.
BEGIN;
DROP POLICY IF EXISTS "Sales can read own quick notes" ON public.operation_notes;
CREATE POLICY "Sales can read own quick notes" ON public.operation_notes
  FOR SELECT TO authenticated USING (public.sales_actor_role() = 'sales' AND created_by = auth.uid());
DROP POLICY IF EXISTS "Sales can create own quick notes" ON public.operation_notes;
CREATE POLICY "Sales can create own quick notes" ON public.operation_notes
  FOR INSERT TO authenticated WITH CHECK (public.sales_actor_role() = 'sales' AND created_by = auth.uid() AND updated_by = auth.uid());
DROP POLICY IF EXISTS "Sales can update own quick notes" ON public.operation_notes;
CREATE POLICY "Sales can update own quick notes" ON public.operation_notes
  FOR UPDATE TO authenticated USING (public.sales_actor_role() = 'sales' AND created_by = auth.uid())
  WITH CHECK (public.sales_actor_role() = 'sales' AND created_by = auth.uid() AND updated_by = auth.uid());
DROP POLICY IF EXISTS "Sales can delete own quick notes" ON public.operation_notes;
CREATE POLICY "Sales can delete own quick notes" ON public.operation_notes
  FOR DELETE TO authenticated USING (public.sales_actor_role() = 'sales' AND created_by = auth.uid());
NOTIFY pgrst,'reload schema';
COMMIT;
