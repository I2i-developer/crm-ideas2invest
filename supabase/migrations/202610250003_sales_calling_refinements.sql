-- Keep bookmark page positions aligned with the 50-row calling queue.
-- This replaces a helper only; existing leads, activities and bookmarks are retained.
BEGIN;
CREATE OR REPLACE FUNCTION public.sales_resume_target(p_lead uuid,p_source uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lead public.sales_leads; position bigint; r text := public.sales_actor_role();
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO lead FROM public.sales_leads WHERE id = p_lead AND source_id = p_source AND archived_at IS NULL;
  IF NOT FOUND OR NOT public.sales_can_access(p_lead) THEN RETURN NULL; END IF;
  SELECT count(*) INTO position FROM public.sales_leads l WHERE l.source_id = p_source AND l.archived_at IS NULL
    AND (r = 'admin' OR auth.uid() = ANY(l.assigned_user_ids))
    AND (l.updated_at > lead.updated_at OR (l.updated_at = lead.updated_at AND l.id < lead.id));
  RETURN jsonb_build_object('id',lead.id,'name',lead.name,'page',floor(position / 50.0)::integer+1);
END $$;
REVOKE ALL ON FUNCTION public.sales_resume_target(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Sales can read company details, never the credential vault.
DROP POLICY IF EXISTS "Sales can read company details" ON public.company_details;
CREATE POLICY "Sales can read company details" ON public.company_details
  FOR SELECT TO authenticated USING (public.sales_actor_role() = 'sales');
NOTIFY pgrst,'reload schema';
COMMIT;
