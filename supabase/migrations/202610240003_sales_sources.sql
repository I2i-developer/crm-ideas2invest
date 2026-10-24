-- Additive source grouping. Existing leads, timelines and assignments are retained.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  name_key text GENERATED ALWAYS AS (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) STORED UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_imports ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.sales_sources(id);
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.sales_sources(id);

INSERT INTO public.sales_sources(name) VALUES ('Manual') ON CONFLICT (name_key) DO NOTHING;
INSERT INTO public.sales_sources(name)
  SELECT DISTINCT left(coalesce(nullif(btrim(filename), ''), 'Calling sheet'), 120) FROM public.sales_imports
  ON CONFLICT (name_key) DO NOTHING;
INSERT INTO public.sales_sources(name)
  SELECT DISTINCT left(coalesce(nullif(btrim(source), ''), 'Manual'), 120)
    FROM public.sales_leads WHERE import_id IS NULL
  ON CONFLICT (name_key) DO NOTHING;
UPDATE public.sales_imports i SET source_id = s.id FROM public.sales_sources s
  WHERE i.source_id IS NULL AND s.name_key = lower(regexp_replace(btrim(left(coalesce(nullif(btrim(i.filename), ''), 'Calling sheet'),120)), '\s+', ' ', 'g'));
UPDATE public.sales_leads l SET source_id = i.source_id FROM public.sales_imports i
  WHERE l.source_id IS NULL AND l.import_id = i.id;
UPDATE public.sales_leads l SET source_id = s.id FROM public.sales_sources s
  WHERE l.source_id IS NULL AND s.name_key = lower(regexp_replace(btrim(left(coalesce(nullif(btrim(l.source), ''), 'Manual'),120)), '\s+', ' ', 'g'));
UPDATE public.sales_leads SET source_id = (SELECT id FROM public.sales_sources WHERE name_key = 'manual') WHERE source_id IS NULL;
ALTER TABLE public.sales_imports ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE public.sales_leads ALTER COLUMN source_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS sales_leads_source_queue_idx ON public.sales_leads(source_id, assigned_to, updated_at DESC);
CREATE INDEX IF NOT EXISTS sales_imports_source_idx ON public.sales_imports(source_id, created_at DESC);

ALTER TABLE public.sales_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_sources_read ON public.sales_sources;
CREATE POLICY sales_sources_read ON public.sales_sources FOR SELECT TO authenticated USING (
  public.sales_actor_role() = 'admin' OR (public.sales_actor_role() = 'sales' AND (
    name_key = 'manual' OR EXISTS (SELECT 1 FROM public.sales_leads l WHERE l.source_id = sales_sources.id AND l.assigned_to = auth.uid())
  ))
);
REVOKE ALL ON public.sales_sources FROM anon, authenticated;
GRANT SELECT ON public.sales_sources TO authenticated;
GRANT ALL ON public.sales_sources TO service_role;

CREATE OR REPLACE FUNCTION public.sales_list_sources()
RETURNS TABLE(id uuid, name text, lead_count bigint, active_count bigint, last_import_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role();
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT s.id, s.name, count(l.id), count(l.id) FILTER (WHERE l.archived_at IS NULL),
    CASE WHEN r = 'admin' THEN (SELECT max(i.created_at) FROM public.sales_imports i WHERE i.source_id = s.id) ELSE NULL END
    FROM public.sales_sources s
    LEFT JOIN public.sales_leads l ON l.source_id = s.id AND (r = 'admin' OR l.assigned_to = auth.uid())
    GROUP BY s.id HAVING r = 'admin' OR count(l.id) > 0 OR s.name_key = 'manual'
    ORDER BY lower(s.name), s.id;
END $$;

CREATE OR REPLACE FUNCTION public.sales_resolve_source(p_id uuid, p_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); result uuid; label text;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_id IS NOT NULL THEN
    IF nullif(btrim(p_name),'') IS NOT NULL THEN RAISE EXCEPTION 'Choose an existing source or a new source, not both'; END IF;
    SELECT s.id INTO result FROM public.sales_sources s WHERE s.id = p_id AND (
      r = 'admin' OR s.name_key = 'manual' OR EXISTS (SELECT 1 FROM public.sales_leads l WHERE l.source_id = s.id AND l.assigned_to = auth.uid())
    );
    IF result IS NULL THEN RAISE EXCEPTION 'Source not found or unavailable' USING ERRCODE = '42501'; END IF;
    RETURN result;
  END IF;
  IF r <> 'admin' THEN RAISE EXCEPTION 'Only admins can create sources' USING ERRCODE = '42501'; END IF;
  label := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  IF length(label) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Source name is required (maximum 120 characters)'; END IF;
  BEGIN
    INSERT INTO public.sales_sources(name,created_by) VALUES (label,auth.uid()) RETURNING id INTO result;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Source already exists. Select it under Existing source.';
  END;
  RETURN result;
END $$;

-- Keep the original column order; new view columns must be appended.
CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.id,l.name,l.phone,l.phone_key,l.email,l.status,l.rnr_count,l.assigned_to,l.created_by,l.import_id,l.source,l.version,l.archived_at,l.created_at,l.updated_at,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
       'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
     FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
     WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due,
    l.source_id
  FROM public.sales_leads l;

CREATE OR REPLACE FUNCTION public.sales_create_lead(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); lead public.sales_leads; owner_id uuid; key text; source_uuid uuid; batch_id uuid;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  owner_id := CASE WHEN r = 'admin' THEN nullif(p->>'assigned_to','')::uuid ELSE auth.uid() END;
  IF owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = owner_id AND role::text IN ('sales','admin')
    AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'Active')) <> 'inactive'
  ) THEN RAISE EXCEPTION 'Select an active sales user'; END IF;
  batch_id := CASE WHEN r = 'admin' THEN nullif(p->>'import_id','')::uuid ELSE NULL END;
  source_uuid := nullif(p->>'source_id','')::uuid;
  IF batch_id IS NOT NULL THEN
    SELECT i.source_id INTO source_uuid FROM public.sales_imports i WHERE i.id = batch_id AND i.imported_by = auth.uid();
    IF source_uuid IS NULL THEN RAISE EXCEPTION 'Invalid import batch'; END IF;
  END IF;
  IF source_uuid IS NULL THEN SELECT id INTO source_uuid FROM public.sales_sources WHERE name_key = 'manual'; END IF;
  source_uuid := public.sales_resolve_source(source_uuid);
  key := public.sales_phone_key(p->>'phone');
  IF key IS NULL THEN RAISE EXCEPTION 'Invalid phone number'; END IF;
  IF p->>'email' IS NOT NULL AND p->>'email' <> '' AND p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  INSERT INTO public.sales_leads(name,phone,phone_key,email,assigned_to,created_by,source,source_id,status,rnr_count,import_id)
    VALUES (btrim(p->>'name'),btrim(p->>'phone'),key,nullif(btrim(p->>'email'),''),owner_id,auth.uid(),
      (SELECT name FROM public.sales_sources WHERE id = source_uuid),source_uuid,
      CASE WHEN batch_id IS NOT NULL THEN coalesce(p->>'status','New') ELSE 'New' END,
      CASE WHEN batch_id IS NOT NULL AND p->>'status' ~ '^RNR-[1-6]$' THEN right(p->>'status',1)::integer ELSE 0 END,batch_id)
    RETURNING * INTO lead;
  INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark,metadata)
    VALUES (lead.id,auth.uid(),CASE WHEN batch_id IS NULL THEN 'contact' ELSE 'import' END,lead.status,
      coalesce(nullif(left(btrim(p->>'remark'),5000),''),'Lead added'),
      jsonb_build_object('source_done_by',left(p->>'done_by',180),'source_id',source_uuid));
  RETURN to_jsonb(lead);
END $$;

CREATE OR REPLACE FUNCTION public.sales_import_to_source(p_rows jsonb,p_filename text,p_assigned_to uuid,p_source_id uuid,p_source_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE batch_id uuid; source_uuid uuid; row jsonb; added integer := 0; rejected_count integer := 0; errors jsonb := '[]';
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Import between 1 and 5000 rows at a time'; END IF;
  source_uuid := public.sales_resolve_source(p_source_id,p_source_name);
  INSERT INTO public.sales_imports(filename,imported_by,assigned_to,source_id)
    VALUES (left(p_filename,255),auth.uid(),p_assigned_to,source_uuid) RETURNING id INTO batch_id;
  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      PERFORM public.sales_create_lead(row || jsonb_build_object('import_id',batch_id,'assigned_to',p_assigned_to));
      added := added + 1;
    EXCEPTION WHEN unique_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error','Duplicate phone already in CRM; existing source and lead are unchanged'));
    WHEN check_violation OR raise_exception OR invalid_text_representation OR not_null_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error',SQLERRM));
    END;
  END LOOP;
  UPDATE public.sales_imports SET accepted = added,rejected = rejected_count WHERE id = batch_id;
  RETURN jsonb_build_object('import_id',batch_id,'source_id',source_uuid,'source_name',(SELECT name FROM public.sales_sources WHERE id = source_uuid),
    'accepted',added,'rejected',rejected_count,'errors',errors);
END $$;

-- Older integrations are still grouped by their filename rather than mixed together.
CREATE OR REPLACE FUNCTION public.sales_import_leads(p_rows jsonb,p_filename text,p_assigned_to uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source_uuid uuid; label text := left(coalesce(nullif(btrim(p_filename),''),'Calling sheet'),120);
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT id INTO source_uuid FROM public.sales_sources WHERE name_key = lower(regexp_replace(label,'\s+',' ','g'));
  RETURN public.sales_import_to_source(p_rows,p_filename,p_assigned_to,source_uuid,CASE WHEN source_uuid IS NULL THEN label ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.sales_source_eod(p_date date,p_user uuid,p_source_id uuid)
RETURNS TABLE(user_id uuid,user_name text,dialed bigint,connected bigint,interested bigint,non_interested bigint,meeting_scheduled bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role();
BEGIN
  IF r IS NULL OR (r = 'sales' AND p_user IS NOT NULL AND p_user <> auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_source_id IS NULL THEN RETURN; END IF;
  PERFORM public.sales_resolve_source(p_source_id);
  RETURN QUERY SELECT p.id,coalesce(p.name,p.full_name,p.email,'Sales user')::text,
    count(a.id),count(a.id) FILTER(WHERE a.connected),
    count(a.id) FILTER(WHERE a.status IN ('Call back later','Follow up','Meeting Schedule','Follow up after meeting')),
    count(a.id) FILTER(WHERE a.status = 'Not Interested'),count(a.id) FILTER(WHERE a.status = 'Meeting Schedule')
    FROM public.profiles p LEFT JOIN public.sales_activities a ON a.actor_id = p.id AND a.kind = 'call'
      AND a.created_at >= (p_date::timestamp AT TIME ZONE 'Asia/Kolkata') AND a.created_at < ((p_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND EXISTS (SELECT 1 FROM public.sales_leads l WHERE l.id = a.lead_id AND l.source_id = p_source_id)
    WHERE (p.role::text = 'sales' OR a.id IS NOT NULL) AND (r = 'admin' OR p.id = auth.uid()) AND (p_user IS NULL OR p.id = p_user)
    GROUP BY p.id,p.name,p.full_name,p.email ORDER BY coalesce(p.name,p.full_name,p.email);
END $$;

REVOKE ALL ON FUNCTION public.sales_list_sources(), public.sales_resolve_source(uuid,text),
  public.sales_import_to_source(jsonb,text,uuid,uuid,text), public.sales_source_eod(date,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_list_sources(), public.sales_resolve_source(uuid,text),
  public.sales_import_to_source(jsonb,text,uuid,uuid,text), public.sales_source_eod(date,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
