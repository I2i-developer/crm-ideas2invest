-- Apply after 202610240006. Function-only change; no saved leads are modified.
BEGIN;
CREATE OR REPLACE FUNCTION public.sales_import_shared_to_source(p_rows jsonb,p_filename text,p_assigned_users uuid[],p_source_id uuid,p_source_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); users uuid[] := p_assigned_users; batch_id uuid; source_uuid uuid;
  row jsonb; lead public.sales_leads; added integer := 0; rejected_count integer := 0; errors jsonb := '[]';
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Import between 1 and 10000 rows at a time'; END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Import between 1 and 10000 rows at a time'; END IF;
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
REVOKE ALL ON FUNCTION public.sales_import_shared_to_source(jsonb,text,uuid[],uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_import_shared_to_source(jsonb,text,uuid[],uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
