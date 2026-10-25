-- Apply after 202610240004. Existing IDs, owners, calls, tasks and EOD records are retained.
BEGIN;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS assigned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.sales_imports ADD COLUMN IF NOT EXISTS assigned_user_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.sales_leads SET assigned_user_ids = ARRAY[assigned_to]
  WHERE assigned_to IS NOT NULL AND cardinality(assigned_user_ids) = 0;
UPDATE public.sales_imports SET assigned_user_ids = ARRAY[assigned_to]
  WHERE assigned_to IS NOT NULL AND cardinality(assigned_user_ids) = 0;
CREATE INDEX IF NOT EXISTS sales_leads_shared_assignees_idx ON public.sales_leads USING gin(assigned_user_ids);

CREATE OR REPLACE FUNCTION public.sales_validate_assignees(p_users uuid[])
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_users IS NULL OR cardinality(p_users) > 100
    OR (cardinality(p_users) > 0 AND (array_ndims(p_users) <> 1 OR array_lower(p_users,1) <> 1))
    THEN RAISE EXCEPTION 'Select up to 100 distinct active Sales or Admin users'; END IF;
  IF array_position(p_users,NULL) IS NOT NULL
    OR cardinality(p_users) <> (SELECT count(DISTINCT u) FROM unnest(p_users) u)
    THEN RAISE EXCEPTION 'Select up to 100 distinct active Sales or Admin users'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_users) u WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u AND p.role::text IN ('sales','admin')
      AND p.is_active IS DISTINCT FROM false AND lower(coalesce(p.status,'Active')) <> 'inactive'
  )) THEN RAISE EXCEPTION 'Select active Sales or Admin users'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_sync_assignees()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Legacy single-owner writes remain supported; explicit shared writes retain all members.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_user_ids IS NOT DISTINCT FROM OLD.assigned_user_ids THEN
      NEW.assigned_user_ids := CASE WHEN NEW.assigned_to IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.assigned_to] END;
    END IF;
  ELSIF cardinality(NEW.assigned_user_ids) = 0 AND NEW.assigned_to IS NOT NULL THEN
    NEW.assigned_user_ids := ARRAY[NEW.assigned_to];
  END IF;
  PERFORM public.sales_validate_assignees(NEW.assigned_user_ids);
  NEW.assigned_to := NEW.assigned_user_ids[1];
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sales_sync_assignees ON public.sales_leads;
CREATE TRIGGER sales_sync_assignees BEFORE INSERT OR UPDATE OF assigned_to,assigned_user_ids ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_sync_assignees();

CREATE OR REPLACE FUNCTION public.sales_can_access(p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.sales_actor_role() = 'admin' OR (
    public.sales_actor_role() = 'sales' AND EXISTS (
      SELECT 1 FROM public.sales_leads WHERE id = p_lead_id AND auth.uid() = ANY(assigned_user_ids)
    )
  ),false)
$$;

DROP POLICY IF EXISTS sales_sources_read ON public.sales_sources;
CREATE POLICY sales_sources_read ON public.sales_sources FOR SELECT TO authenticated USING (
  public.sales_actor_role() = 'admin' OR (public.sales_actor_role() = 'sales' AND (
    name_key = 'manual' OR created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.sales_leads l WHERE l.source_id = sales_sources.id AND auth.uid() = ANY(l.assigned_user_ids)
    )
  ))
);
DROP POLICY IF EXISTS sales_imports_read ON public.sales_imports;
CREATE POLICY sales_imports_read ON public.sales_imports FOR SELECT TO authenticated
  USING (public.sales_actor_role() = 'admin' OR (public.sales_actor_role() = 'sales' AND imported_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.sales_list_sources()
RETURNS TABLE(id uuid,name text,lead_count bigint,active_count bigint,last_import_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role();
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT s.id,s.name,count(l.id),count(l.id) FILTER (WHERE l.archived_at IS NULL),
    (SELECT max(i.created_at) FROM public.sales_imports i WHERE i.source_id = s.id AND (r = 'admin' OR i.imported_by = auth.uid()))
    FROM public.sales_sources s
    LEFT JOIN public.sales_leads l ON l.source_id = s.id AND (r = 'admin' OR auth.uid() = ANY(l.assigned_user_ids))
    GROUP BY s.id HAVING r = 'admin' OR count(l.id) > 0 OR s.name_key = 'manual' OR s.created_by = auth.uid()
    ORDER BY lower(s.name),s.id;
END $$;

CREATE OR REPLACE FUNCTION public.sales_resolve_source(p_id uuid,p_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); result uuid; label text;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_id IS NOT NULL THEN
    IF nullif(btrim(p_name),'') IS NOT NULL THEN RAISE EXCEPTION 'Choose an existing source or a new source, not both'; END IF;
    SELECT s.id INTO result FROM public.sales_sources s WHERE s.id = p_id AND (
      r = 'admin' OR s.name_key = 'manual' OR s.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.sales_leads l WHERE l.source_id = s.id AND auth.uid() = ANY(l.assigned_user_ids)
      )
    );
    IF result IS NULL THEN RAISE EXCEPTION 'Source not found or unavailable' USING ERRCODE = '42501'; END IF;
    RETURN result;
  END IF;
  label := regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');
  IF length(label) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Source name is required (maximum 120 characters)'; END IF;
  BEGIN
    INSERT INTO public.sales_sources(name,created_by) VALUES(label,auth.uid()) RETURNING id INTO result;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Source already exists. Select it under Existing source.';
  END;
  RETURN result;
END $$;

CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.id,l.name,l.phone,l.phone_key,l.email,l.status,l.rnr_count,l.assigned_to,l.created_by,l.import_id,l.source,l.version,l.archived_at,l.created_at,l.updated_at,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
      'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
      FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
      WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due,
    l.source_id,l.address,l.assigned_user_ids
  FROM public.sales_leads l;

CREATE OR REPLACE FUNCTION public.sales_import_shared_to_source(p_rows jsonb,p_filename text,p_assigned_users uuid[],p_source_id uuid,p_source_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); users uuid[] := p_assigned_users; batch_id uuid; source_uuid uuid;
  row jsonb; lead public.sales_leads; added integer := 0; rejected_count integer := 0; errors jsonb := '[]';
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Import between 1 and 5000 rows at a time'; END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Import between 1 and 5000 rows at a time'; END IF;
  IF users IS NULL THEN RAISE EXCEPTION 'Select valid assignees'; END IF;
  IF r = 'sales' AND cardinality(users) = 0 THEN users := ARRAY[auth.uid()]; END IF;
  PERFORM public.sales_validate_assignees(users);
  source_uuid := public.sales_resolve_source(p_source_id,p_source_name);
  INSERT INTO public.sales_imports(filename,imported_by,assigned_to,assigned_user_ids,source_id)
    VALUES(left(coalesce(p_filename,'Calling sheet'),255),auth.uid(),users[1],users,source_uuid) RETURNING id INTO batch_id;
  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      IF jsonb_typeof(row) <> 'object' THEN RAISE EXCEPTION 'Invalid lead row'; END IF;
      IF coalesce(row->>'email','') <> '' AND (length(row->>'email') > 254 OR row->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email address'; END IF;
      INSERT INTO public.sales_leads(name,phone,phone_key,email,address,assigned_to,assigned_user_ids,created_by,source,source_id,status,rnr_count,import_id)
        VALUES(btrim(row->>'name'),btrim(row->>'phone'),public.sales_phone_key(row->>'phone'),nullif(btrim(row->>'email'),''),nullif(btrim(row->>'address'),''),
          users[1],users,auth.uid(),(SELECT name FROM public.sales_sources WHERE id = source_uuid),source_uuid,coalesce(row->>'status','New'),
          CASE WHEN row->>'status' ~ '^RNR-[1-6]$' THEN right(row->>'status',1)::integer ELSE 0 END,batch_id) RETURNING * INTO lead;
      INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark,metadata)
        VALUES(lead.id,auth.uid(),'import',lead.status,coalesce(nullif(left(btrim(row->>'remark'),5000),''),'Lead added'),
          jsonb_build_object('source_done_by',left(row->>'done_by',180),'source_id',source_uuid,'assigned_user_ids',to_jsonb(users)));
      added := added + 1;
    EXCEPTION WHEN unique_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error','Duplicate phone already in CRM; existing source, lead and assignees are unchanged'));
    WHEN check_violation OR raise_exception OR invalid_text_representation OR not_null_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error',SQLERRM));
    END;
  END LOOP;
  UPDATE public.sales_imports SET accepted = added,rejected = rejected_count WHERE id = batch_id;
  RETURN jsonb_build_object('import_id',batch_id,'source_id',source_uuid,'source_name',(SELECT name FROM public.sales_sources WHERE id = source_uuid),
    'assigned_user_ids',to_jsonb(users),'accepted',added,'rejected',rejected_count,'errors',errors);
END $$;

-- Existing integrations keep their single-user signature and now use the same checks.
CREATE OR REPLACE FUNCTION public.sales_import_to_source(p_rows jsonb,p_filename text,p_assigned_to uuid,p_source_id uuid,p_source_name text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.sales_import_shared_to_source(p_rows,p_filename,
    CASE WHEN p_assigned_to IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_assigned_to] END,p_source_id,p_source_name)
$$;

CREATE OR REPLACE FUNCTION public.sales_update_shared_lead(p_id uuid,p jsonb,p_users uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lead public.sales_leads; result jsonb;
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO lead FROM public.sales_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  PERFORM public.sales_validate_assignees(p_users);
  IF p_users IS DISTINCT FROM lead.assigned_user_ids AND EXISTS(SELECT 1 FROM public.sales_meetings WHERE lead_id = p_id AND status = 'Scheduled')
    THEN RAISE EXCEPTION 'Cancel the scheduled meeting before changing the lead assignment'; END IF;
  result := public.sales_update_lead(p_id,p || jsonb_build_object('assigned_to',p_users[1]));
  IF p_users IS DISTINCT FROM lead.assigned_user_ids THEN
    UPDATE public.sales_followups SET notified_at = NULL WHERE lead_id = p_id AND status = 'Pending';
  END IF;
  UPDATE public.sales_leads SET assigned_user_ids = p_users WHERE id = p_id RETURNING * INTO lead;
  IF p_users IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(result->'assigned_user_ids')::uuid) THEN
    INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark,metadata)
      VALUES(p_id,auth.uid(),'assignment',lead.status,'Shared lead assignment updated',jsonb_build_object('assigned_user_ids',to_jsonb(p_users)));
  END IF;
  RETURN to_jsonb(lead);
END $$;

REVOKE ALL ON FUNCTION public.sales_validate_assignees(uuid[]),public.sales_sync_assignees() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sales_import_shared_to_source(jsonb,text,uuid[],uuid,text),public.sales_update_shared_lead(uuid,jsonb,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_import_shared_to_source(jsonb,text,uuid[],uuid,text),public.sales_update_shared_lead(uuid,jsonb,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
