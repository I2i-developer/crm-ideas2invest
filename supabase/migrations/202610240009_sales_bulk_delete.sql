-- Apply after 202610240008. Installing this function does not delete any data.
BEGIN;
CREATE OR REPLACE FUNCTION public.sales_delete_imported_leads(
  p_source uuid,p_ids uuid[],p_all boolean,p_preview boolean,p_fingerprint text DEFAULT NULL,p_confirmation text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text; ids uuid[]; total integer; fingerprint text; deleted_count integer;
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only admins can delete imported leads' USING ERRCODE = '42501'; END IF;
  IF p_all IS NULL OR p_preview IS NULL OR p_source IS NULL THEN RAISE EXCEPTION 'Choose a source and deletion scope'; END IF;
  SELECT name INTO label FROM public.sales_sources WHERE id = p_source;
  IF label IS NULL THEN RAISE EXCEPTION 'Source not found'; END IF;
  IF p_all THEN
    IF coalesce(cardinality(p_ids),0) <> 0 THEN RAISE EXCEPTION 'Choose selected leads or all imported leads, not both'; END IF;
  ELSE
    IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 10000 OR array_ndims(p_ids) <> 1 OR array_lower(p_ids,1) <> 1 THEN
      RAISE EXCEPTION 'Select between 1 and 10000 imported leads';
    END IF;
    IF array_position(p_ids,NULL) IS NOT NULL OR cardinality(p_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_ids) id) THEN
      RAISE EXCEPTION 'Select distinct valid lead IDs';
    END IF;
  END IF;
  -- Lock a deterministic snapshot. New imports are never silently added to a confirmed deletion.
  SELECT coalesce(array_agg(c.id ORDER BY c.id),'{}'::uuid[]) INTO ids FROM (
    SELECT l.id FROM public.sales_leads l WHERE l.source_id = p_source AND l.import_id IS NOT NULL
      AND (p_all OR l.id = ANY(p_ids)) ORDER BY l.id FOR UPDATE
  ) c;
  total := cardinality(ids);
  IF NOT p_all AND total <> cardinality(p_ids) THEN RAISE EXCEPTION 'Selection changed: some leads are missing, manually added, or belong to another source. Refresh and select again.'; END IF;
  fingerprint := md5(p_source::text || ':' || p_all::text || ':' || array_to_string(ids,','));
  IF p_preview THEN RETURN jsonb_build_object('source_id',p_source,'source_name',label,'count',total,'fingerprint',fingerprint); END IF;
  IF p_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'Deletion conflict: imported leads changed. Review a fresh confirmation before deleting.'; END IF;
  IF p_confirmation IS DISTINCT FROM (CASE WHEN p_all THEN label ELSE 'DELETE' END) THEN RAISE EXCEPTION 'Confirmation does not match'; END IF;
  IF total = 0 THEN RAISE EXCEPTION 'No imported leads to delete'; END IF;

  DELETE FROM public.task_notifications WHERE entity_type = 'sales_lead' AND entity_id = ANY(ids);
  DELETE FROM public.sales_leads WHERE id = ANY(ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  -- Keep a durable audit record in the same transaction as the deletion.
  INSERT INTO public.audit_logs(actor_id,actor_email,actor_role,action,entity_type,entity_id,old_value,new_value,metadata)
    VALUES(auth.uid(),(SELECT email FROM public.profiles WHERE id = auth.uid()),'admin','sales_imported_leads_deleted','sales_source',p_source,
      jsonb_build_object('lead_count',total),jsonb_build_object('deleted',deleted_count),
      jsonb_build_object('source_name',label,'scope',CASE WHEN p_all THEN 'all_imported' ELSE 'selected' END,'fingerprint',fingerprint));
  RETURN jsonb_build_object('source_id',p_source,'source_name',label,'deleted',deleted_count);
END $$;
REVOKE ALL ON FUNCTION public.sales_delete_imported_leads(uuid,uuid[],boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_delete_imported_leads(uuid,uuid[],boolean,boolean,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
