-- Personal calling bookmarks and source-scoped analytics. Existing work records are unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sales_lead_bookmarks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sales_sources(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,source_id)
);
ALTER TABLE public.sales_lead_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_bookmarks_read ON public.sales_lead_bookmarks;
CREATE POLICY sales_bookmarks_read ON public.sales_lead_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.sales_actor_role() IS NOT NULL AND public.sales_can_access(lead_id));
REVOKE ALL ON public.sales_lead_bookmarks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sales_lead_bookmarks TO authenticated;
GRANT ALL ON public.sales_lead_bookmarks TO service_role;

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
  RETURN jsonb_build_object('id',lead.id,'name',lead.name,'page',floor(position / 25.0)::integer+1);
END $$;

CREATE OR REPLACE FUNCTION public.sales_calling_state(p_source uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE last_id uuid; last_time timestamptz; marked_id uuid; marked_time timestamptz;
BEGIN
  IF public.sales_actor_role() IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM public.sales_resolve_source(p_source);
  SELECT a.lead_id,a.created_at INTO last_id,last_time FROM public.sales_activities a
    JOIN public.sales_leads l ON l.id = a.lead_id
    WHERE a.actor_id = auth.uid() AND a.kind = 'call' AND l.source_id = p_source AND l.archived_at IS NULL
      AND public.sales_can_access(l.id) ORDER BY a.created_at DESC,a.id DESC LIMIT 1;
  SELECT lead_id,updated_at INTO marked_id,marked_time FROM public.sales_lead_bookmarks WHERE user_id = auth.uid() AND source_id = p_source;
  RETURN jsonb_build_object('last_call',public.sales_resume_target(last_id,p_source),'last_called_at',last_time,
    'bookmark',public.sales_resume_target(marked_id,p_source),'bookmarked_at',marked_time);
END $$;

CREATE OR REPLACE FUNCTION public.sales_set_bookmark(p_source uuid,p_lead uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.sales_actor_role() IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'Select a source'; END IF;
  PERFORM public.sales_resolve_source(p_source);
  IF p_lead IS NULL THEN DELETE FROM public.sales_lead_bookmarks WHERE user_id = auth.uid() AND source_id = p_source;
  ELSE
    IF public.sales_resume_target(p_lead,p_source) IS NULL THEN RAISE EXCEPTION 'Lead not found or unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.sales_lead_bookmarks(user_id,source_id,lead_id) VALUES(auth.uid(),p_source,p_lead)
      ON CONFLICT(user_id,source_id) DO UPDATE SET lead_id = excluded.lead_id,updated_at = now();
  END IF;
  RETURN public.sales_calling_state(p_source);
END $$;

CREATE OR REPLACE FUNCTION public.sales_calling_insights(p_source uuid,p_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; pipeline jsonb; daily jsonb;
BEGIN
  IF r IS NULL OR (r = 'sales' AND p_owner IS NOT NULL AND p_owner <> auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'Select a source'; END IF;
  PERFORM public.sales_resolve_source(p_source);
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',bucket,'value',total) ORDER BY bucket),'[]') INTO pipeline FROM (
    SELECT CASE WHEN status = 'New' THEN 'Not called'
      WHEN status ~ '^RNR-' OR status IN ('Call Busy','Switched off') THEN 'Retry calls'
      WHEN status IN ('Call back later','Follow up','Follow up after meeting','Meeting Cancelled') THEN 'Follow-up'
      WHEN status IN ('Meeting Schedule','Meeting Completed') THEN 'Meetings' ELSE 'Closed' END AS bucket,count(*) AS total
    FROM public.sales_leads l WHERE source_id = p_source AND archived_at IS NULL
      AND (r = 'admin' OR auth.uid() = ANY(l.assigned_user_ids)) AND (p_owner IS NULL OR p_owner = ANY(l.assigned_user_ids)) GROUP BY bucket
  ) s;
  WITH counts AS (
    SELECT (a.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS dialed,count(*) FILTER(WHERE a.connected) AS connected
    FROM public.sales_activities a JOIN public.sales_leads l ON l.id = a.lead_id
    WHERE l.source_id = p_source AND a.kind = 'call'
      AND a.created_at >= ((today-6)::timestamp AT TIME ZONE 'Asia/Kolkata') AND a.created_at < ((today+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND (r = 'admin' OR (a.actor_id = auth.uid() AND public.sales_can_access(l.id))) AND (p_owner IS NULL OR a.actor_id = p_owner)
    GROUP BY day
  ) SELECT jsonb_agg(jsonb_build_object('date',today-6+n,'dialed',coalesce(c.dialed,0),'connected',coalesce(c.connected,0)) ORDER BY n)
    INTO daily FROM generate_series(0,6) n LEFT JOIN counts c ON c.day = today-6+n;
  RETURN jsonb_build_object('pipeline',pipeline,'daily',daily);
END $$;

REVOKE ALL ON FUNCTION public.sales_resume_target(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sales_calling_state(uuid),public.sales_set_bookmark(uuid,uuid),public.sales_calling_insights(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_calling_state(uuid),public.sales_set_bookmark(uuid,uuid),public.sales_calling_insights(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
