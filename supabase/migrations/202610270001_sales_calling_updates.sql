-- Calling workflow updates; no saved activities, leads or reminders are rewritten.
BEGIN;
ALTER TABLE public.sales_activities DROP CONSTRAINT IF EXISTS sales_activities_remark_check;
ALTER TABLE public.sales_activities ADD CONSTRAINT sales_activities_remark_check
  CHECK (length(remark) <= 5000 AND (kind = 'call' OR length(remark) >= 1));
CREATE OR REPLACE FUNCTION public.sales_record_activity(p_id uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE lead public.sales_leads; activity public.sales_activities; existing public.sales_activities;
  next_status text; event_kind text; remark_text text; due timestamptz; start_at timestamptz; end_at timestamptz;
  meeting public.sales_meetings; note_id uuid; meeting_id uuid; connected boolean; reminder_title text;
BEGIN
  SELECT * INTO lead FROM public.sales_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_access(p_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO existing FROM public.sales_activities WHERE request_id = (p->>'request_id')::uuid;
  IF FOUND THEN
    IF existing.lead_id <> p_id OR existing.actor_id <> auth.uid() THEN RAISE EXCEPTION 'Request conflict'; END IF;
    RETURN jsonb_build_object('activity',to_jsonb(existing),'lead',to_jsonb(lead));
  END IF;
  IF lead.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restore this lead before adding an activity'; END IF;
  IF (p->>'version')::integer IS DISTINCT FROM lead.version THEN RAISE EXCEPTION 'Lead changed since you opened it. Refresh and try again.'; END IF;
  event_kind := coalesce(p->>'kind','call');
  IF event_kind NOT IN ('call','note','meeting') THEN RAISE EXCEPTION 'Invalid activity type'; END IF;
  IF event_kind = 'call' AND lead.status IN ('Do Not Call','Converted') THEN RAISE EXCEPTION 'Lead is closed for calling'; END IF;
  remark_text := btrim(coalesce(p->>'remark',''));
  IF length(remark_text) > 5000 OR (event_kind <> 'call' AND length(remark_text) = 0) THEN RAISE EXCEPTION 'A remark is required except for calls (maximum 5000 characters)'; END IF;
  IF event_kind <> 'note' AND p->>'status' = 'Do Not Call' THEN RAISE EXCEPTION 'Do Not Call is no longer available for new activity'; END IF;
  next_status := CASE WHEN event_kind = 'note' THEN lead.status ELSE p->>'status' END;
  IF next_status = 'RNR' THEN next_status := 'RNR-' || least(6,lead.rnr_count+1); END IF;
  IF next_status IS NULL OR (event_kind = 'call' AND next_status = 'New') THEN RAISE EXCEPTION 'Choose a call status'; END IF;
  IF event_kind <> 'note' AND next_status ~ '^RNR-[1-6]$' AND next_status <> 'RNR-' || least(6,lead.rnr_count+1)
    THEN RAISE EXCEPTION 'RNR attempts must be recorded in sequence'; END IF;
  due := nullif(p->>'due_at','')::timestamptz;
  IF event_kind <> 'note' THEN
    IF next_status = 'Call Busy' THEN due := now() + interval '3 days'; END IF;
    IF next_status = 'Switched off' THEN due := now() + interval '7 days'; END IF;
    IF next_status IN ('Call back later','Follow up','Follow up after meeting') AND due IS NULL
      THEN RAISE EXCEPTION 'Confirm the follow-up time'; END IF;
    IF due IS NOT NULL AND due <= now() THEN RAISE EXCEPTION 'Follow-up time must be in the future'; END IF;
  END IF;
  connected := event_kind = 'call' AND next_status NOT IN ('Call Busy','Switched off','Wrong Number')
    AND next_status !~ '^RNR-';
  INSERT INTO public.sales_activities(lead_id,request_id,actor_id,kind,previous_status,status,remark,connected,due_at)
    VALUES(p_id,(p->>'request_id')::uuid,auth.uid(),event_kind,lead.status,next_status,remark_text,connected,due)
    RETURNING * INTO activity;

  IF event_kind <> 'note' THEN
    UPDATE public.sales_followups SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Pending' AND kind = 'followup';
    IF next_status IN ('Meeting Schedule','Meeting Completed','Meeting Cancelled','Do Not Call','Not Interested','Wrong Number','Converted') THEN
      UPDATE public.sales_followups SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Pending';
    END IF;
    IF due IS NOT NULL AND next_status NOT IN ('Meeting Schedule','Do Not Call','Not Interested','Wrong Number','Converted') THEN
      IF lead.assigned_to IS NULL THEN RAISE EXCEPTION 'Assign the lead before scheduling a follow-up'; END IF;
      INSERT INTO public.sales_followups(lead_id,activity_id,user_id,title,due_at)
        VALUES(p_id,activity.id,lead.assigned_to,next_status || ': ' || lead.name,due);
    END IF;
    IF next_status = 'Meeting Schedule' THEN
      start_at := (p->>'meeting_at')::timestamptz; end_at := (p->>'meeting_end')::timestamptz;
      IF lead.assigned_to IS NULL OR start_at IS NULL OR end_at IS NULL OR start_at <= now()
        OR end_at <= start_at OR end_at > start_at + interval '8 hours' THEN RAISE EXCEPTION 'Choose an assigned user and a valid future meeting time (maximum 8 hours)'; END IF;
      -- Serialize meeting bookings for this user, including calls from other leads.
      PERFORM pg_advisory_xact_lock(hashtextextended(lead.assigned_to::text,0));
      IF EXISTS(SELECT 1 FROM public.sales_meetings WHERE assigned_to = lead.assigned_to AND lead_id <> p_id
        AND status = 'Scheduled' AND starts_at < end_at AND ends_at > start_at)
        THEN RAISE EXCEPTION 'A meeting is already scheduled for this user at that time'; END IF;
      UPDATE public.sales_meetings SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Scheduled';
      INSERT INTO public.sales_meetings(lead_id,assigned_to,starts_at,ends_at,location,created_by)
        VALUES(p_id,lead.assigned_to,start_at,end_at,left(p->>'location',500),auth.uid()) RETURNING id INTO meeting_id;
      INSERT INTO public.sales_followups(lead_id,activity_id,meeting_id,user_id,kind,title,due_at)
        VALUES(p_id,activity.id,meeting_id,lead.assigned_to,'meeting','Meeting: ' || lead.name,greatest(now(),start_at-interval '30 minutes'));
      UPDATE public.sales_activities SET metadata = jsonb_build_object('meeting_id',meeting_id,'starts_at',start_at,'ends_at',end_at,'location',p->>'location') WHERE id = activity.id;
    ELSIF next_status = 'Meeting Completed' THEN
      IF length(btrim(coalesce(p->>'meeting_notes',''))) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Add meeting notes (maximum 20000 characters)'; END IF;
      SELECT * INTO meeting FROM public.sales_meetings WHERE lead_id = p_id AND status = 'Scheduled' ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
      INSERT INTO public.client_meetings(title,meeting_type,meeting_datetime,raw_notes,status,created_by,updated_by)
        VALUES('Sales meeting - ' || lead.name,'First meeting',coalesce(meeting.starts_at,now()),btrim(p->>'meeting_notes'),'Draft',auth.uid(),auth.uid())
        RETURNING id INTO note_id;
      IF meeting.id IS NULL THEN
        INSERT INTO public.sales_meetings(lead_id,assigned_to,starts_at,ends_at,status,meeting_note_id,created_by)
          VALUES(p_id,coalesce(lead.assigned_to,auth.uid()),now(),now()+interval '30 minutes','Completed',note_id,auth.uid()) RETURNING id INTO meeting_id;
      ELSE
        UPDATE public.sales_meetings SET status = 'Completed',meeting_note_id = note_id WHERE id = meeting.id RETURNING id INTO meeting_id;
      END IF;
      UPDATE public.sales_activities SET metadata = jsonb_build_object('meeting_id',meeting_id,'meeting_note_id',note_id) WHERE id = activity.id;
    ELSIF next_status IN ('Meeting Cancelled','Do Not Call','Converted','Not Interested') THEN
      UPDATE public.sales_meetings SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Scheduled';
    END IF;
  END IF;
  UPDATE public.sales_leads SET status = next_status,
    rnr_count = CASE WHEN event_kind <> 'note' AND next_status ~ '^RNR-' THEN right(next_status,1)::integer ELSE rnr_count END,
    version = version+1,updated_at = now() WHERE id = p_id RETURNING * INTO lead;
  SELECT * INTO activity FROM public.sales_activities WHERE id = activity.id;
  RETURN jsonb_build_object('lead',to_jsonb(lead),'activity',to_jsonb(activity));
END $$;

CREATE OR REPLACE FUNCTION public.sales_calling_insights(p_source uuid,p_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; pipeline jsonb; daily jsonb;
BEGIN
  IF r IS NULL OR (r = 'sales' AND p_owner IS NOT NULL AND p_owner <> auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'Select a source'; END IF;
  PERFORM public.sales_resolve_source(p_source);
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',bucket,'value',total) ORDER BY bucket),'[]') INTO pipeline FROM (
    SELECT CASE WHEN status ~ '^RNR-' OR status IN ('Call Busy','Switched off') THEN 'Retry calls'
      WHEN status IN ('Call back later','Follow up','Follow up after meeting','Meeting Cancelled') THEN 'Follow-up'
      WHEN status = 'Meeting Schedule' THEN 'Meetings scheduled' WHEN status = 'Meeting Completed' THEN 'Meetings completed'
      WHEN status = 'Not Interested' THEN 'Not interested' ELSE 'Converted / Other closed' END AS bucket,count(*) AS total
    FROM public.sales_leads l WHERE source_id = p_source AND archived_at IS NULL AND status <> 'New'
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


CREATE OR REPLACE FUNCTION public.sales_call_activity(p_source uuid,p_date date,p_metric text,p_owner uuid DEFAULT NULL,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text := public.sales_actor_role(); result jsonb;
BEGIN
  IF r IS NULL OR (r = 'sales' AND p_owner IS NOT NULL AND p_owner <> auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF p_page NOT BETWEEN 1 AND 100000 OR p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR p_metric NOT IN ('dialed','connected','interested','non_interested','meeting_scheduled') THEN RAISE EXCEPTION 'Invalid call activity filter'; END IF;
  PERFORM public.sales_resolve_source(p_source);
  WITH matching AS MATERIALIZED (
    SELECT a.id,CASE WHEN public.sales_can_access(l.id) THEN l.id END AS lead_id,
      CASE WHEN public.sales_can_access(l.id) THEN l.name ELSE 'Lead no longer accessible' END AS name,
      a.status,CASE WHEN public.sales_can_access(l.id) THEN a.remark END AS remark,a.created_at,
      coalesce(p.name,p.full_name,p.email,'CRM user') AS done_by
    FROM public.sales_activities a JOIN public.sales_leads l ON l.id = a.lead_id LEFT JOIN public.profiles p ON p.id = a.actor_id
    WHERE l.source_id = p_source AND a.kind = 'call' AND (r = 'admin' OR a.actor_id = auth.uid())
      AND (p_owner IS NULL OR a.actor_id = p_owner)
      AND a.created_at >= (p_date::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND a.created_at < ((p_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND CASE p_metric WHEN 'dialed' THEN true WHEN 'connected' THEN a.connected
        WHEN 'interested' THEN a.status IN ('Call back later','Follow up','Meeting Schedule','Follow up after meeting')
        WHEN 'non_interested' THEN a.status = 'Not Interested'
        WHEN 'meeting_scheduled' THEN a.status = 'Meeting Schedule' ELSE false END
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'rows',coalesce((
    SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.id DESC)
    FROM (SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ((p_page-1)*50)) page
  ),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.sales_call_activity(uuid,date,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_call_activity(uuid,date,text,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
