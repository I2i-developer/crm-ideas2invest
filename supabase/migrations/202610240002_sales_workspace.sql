BEGIN;

-- New sales data is isolated; no existing client, task, or EOD rows are updated.
DO $$
DECLARE role_type regtype; type_kind "char";
BEGIN
  SELECT a.atttypid::regtype, t.typtype INTO role_type, type_kind
  FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = 'public.profiles'::regclass AND a.attname = 'role';
  IF type_kind = 'e' THEN
    EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', role_type, 'sales');
  END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role::text IN ('admin', 'operations', 'sales')) NOT VALID;

CREATE TABLE IF NOT EXISTS public.sales_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  accepted integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  phone text NOT NULL,
  phone_key text NOT NULL UNIQUE CHECK (phone_key ~ '^\+[0-9]{8,15}$'),
  email text,
  status text NOT NULL DEFAULT 'New',
  rnr_count integer NOT NULL DEFAULT 0 CHECK (rnr_count BETWEEN 0 AND 6),
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  import_id uuid REFERENCES public.sales_imports(id),
  source text NOT NULL DEFAULT 'Manual',
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_leads_status_check CHECK (status IN (
    'New','RNR-1','RNR-2','RNR-3','RNR-4','RNR-5','RNR-6','Call Busy','Switched off',
    'Call back later','Follow up','Meeting Schedule','Meeting Completed','Follow up after meeting',
    'Not Interested','Wrong Number','Do Not Call','Converted','Meeting Cancelled'
  ))
);

CREATE TABLE IF NOT EXISTS public.sales_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL CHECK (kind IN ('call','note','meeting','assignment','import','reminder','contact','archive')),
  previous_status text,
  status text NOT NULL,
  remark text NOT NULL CHECK (length(btrim(remark)) BETWEEN 1 AND 5000),
  connected boolean NOT NULL DEFAULT false,
  due_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  location text,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled')),
  meeting_note_id uuid REFERENCES public.client_meetings(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.sales_activities(id),
  meeting_id uuid REFERENCES public.sales_meetings(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL DEFAULT 'followup' CHECK (kind IN ('followup','meeting')),
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Completed','Cancelled')),
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_leads_queue_idx ON public.sales_leads(assigned_to, updated_at DESC);
CREATE INDEX IF NOT EXISTS sales_activities_timeline_idx ON public.sales_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_activities_eod_idx ON public.sales_activities(actor_id, created_at) WHERE kind = 'call';
CREATE INDEX IF NOT EXISTS sales_meetings_calendar_idx ON public.sales_meetings(assigned_to, starts_at);
CREATE INDEX IF NOT EXISTS sales_followups_due_idx ON public.sales_followups(user_id, due_at) WHERE status = 'Pending';
CREATE UNIQUE INDEX IF NOT EXISTS sales_one_pending_followup_idx ON public.sales_followups(lead_id, kind) WHERE status = 'Pending';

CREATE OR REPLACE FUNCTION public.sales_actor_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM public.profiles
  WHERE id = auth.uid() AND is_active IS DISTINCT FROM false
    AND lower(coalesce(status, 'Active')) <> 'inactive'
    AND role::text IN ('admin','sales')
$$;

CREATE OR REPLACE FUNCTION public.sales_can_access(p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(public.sales_actor_role() = 'admin' OR (
    public.sales_actor_role() = 'sales' AND EXISTS (
      SELECT 1 FROM public.sales_leads WHERE id = p_lead_id AND assigned_to = auth.uid()
    )
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.sales_phone_key(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE digits text;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^[+0-9 ().-]+$' THEN RETURN NULL; END IF;
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF length(digits) = 11 AND left(digits,1) = '0' THEN digits := substring(digits FROM 2); END IF;
  IF length(digits) = 10 THEN digits := '91' || digits; END IF;
  IF digits !~ '^[0-9]{8,15}$' THEN RETURN NULL; END IF;
  RETURN '+' || digits;
END $$;

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_leads_read ON public.sales_leads;
CREATE POLICY sales_leads_read ON public.sales_leads FOR SELECT TO authenticated
  USING (public.sales_can_access(id));
DROP POLICY IF EXISTS sales_activities_read ON public.sales_activities;
CREATE POLICY sales_activities_read ON public.sales_activities FOR SELECT TO authenticated
  USING (public.sales_can_access(lead_id));
DROP POLICY IF EXISTS sales_meetings_read ON public.sales_meetings;
CREATE POLICY sales_meetings_read ON public.sales_meetings FOR SELECT TO authenticated
  USING (public.sales_can_access(lead_id));
DROP POLICY IF EXISTS sales_followups_read ON public.sales_followups;
CREATE POLICY sales_followups_read ON public.sales_followups FOR SELECT TO authenticated
  USING (public.sales_can_access(lead_id));
DROP POLICY IF EXISTS sales_imports_read ON public.sales_imports;
CREATE POLICY sales_imports_read ON public.sales_imports FOR SELECT TO authenticated
  USING (public.sales_actor_role() = 'admin');

CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.*,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
       'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
     FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
     WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due
  FROM public.sales_leads l;
REVOKE ALL ON public.sales_lead_queue FROM anon;
GRANT SELECT ON public.sales_lead_queue TO authenticated, service_role;

-- Writes are available only through validated, transactional RPCs.
REVOKE ALL ON public.sales_leads, public.sales_activities, public.sales_meetings, public.sales_followups, public.sales_imports FROM anon, authenticated;
GRANT SELECT ON public.sales_leads, public.sales_activities, public.sales_meetings, public.sales_followups, public.sales_imports TO authenticated;
GRANT ALL ON public.sales_leads, public.sales_activities, public.sales_meetings, public.sales_followups, public.sales_imports TO service_role;

CREATE OR REPLACE FUNCTION public.sales_create_lead(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r text := public.sales_actor_role(); lead public.sales_leads; owner_id uuid; key text;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  owner_id := CASE WHEN r = 'admin' THEN nullif(p->>'assigned_to','')::uuid ELSE auth.uid() END;
  IF owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = owner_id AND role::text IN ('sales','admin')
    AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'Active')) <> 'inactive'
  ) THEN RAISE EXCEPTION 'Select an active sales user'; END IF;
  key := public.sales_phone_key(p->>'phone');
  IF key IS NULL THEN RAISE EXCEPTION 'Invalid phone number'; END IF;
  IF p->>'email' IS NOT NULL AND p->>'email' <> '' AND p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  INSERT INTO public.sales_leads(name, phone, phone_key, email, assigned_to, created_by, source, status, rnr_count, import_id)
    VALUES (btrim(p->>'name'), btrim(p->>'phone'), key, nullif(btrim(p->>'email'),''), owner_id, auth.uid(),
      CASE WHEN r = 'admin' AND p->>'import_id' IS NOT NULL THEN 'Calling sheet' ELSE 'Manual' END,
      CASE WHEN r = 'admin' AND p->>'import_id' IS NOT NULL THEN coalesce(p->>'status','New') ELSE 'New' END,
      CASE WHEN r = 'admin' AND p->>'status' ~ '^RNR-[1-6]$' THEN right(p->>'status',1)::integer ELSE 0 END,
      CASE WHEN r = 'admin' THEN nullif(p->>'import_id','')::uuid ELSE NULL END)
    RETURNING * INTO lead;
  INSERT INTO public.sales_activities(lead_id, actor_id, kind, status, remark, metadata)
    VALUES (lead.id, auth.uid(), CASE WHEN lead.import_id IS NULL THEN 'contact' ELSE 'import' END, lead.status,
      coalesce(nullif(left(btrim(p->>'remark'),5000),''), 'Lead added'),
      jsonb_build_object('source_done_by', left(p->>'done_by',180)));
  RETURN to_jsonb(lead);
END $$;

CREATE OR REPLACE FUNCTION public.sales_import_leads(p_rows jsonb, p_filename text, p_assigned_to uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE batch_id uuid; row jsonb; added integer := 0; rejected_count integer := 0; errors jsonb := '[]';
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN RAISE EXCEPTION 'Import at most 5000 rows at a time'; END IF;
  INSERT INTO public.sales_imports(filename, imported_by, assigned_to)
    VALUES (left(p_filename,255), auth.uid(), p_assigned_to) RETURNING id INTO batch_id;
  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      PERFORM public.sales_create_lead(row || jsonb_build_object('import_id',batch_id,'assigned_to',p_assigned_to));
      added := added + 1;
    EXCEPTION WHEN unique_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error','Duplicate phone already in CRM'));
    WHEN check_violation OR raise_exception OR invalid_text_representation OR not_null_violation THEN
      rejected_count := rejected_count + 1;
      errors := errors || jsonb_build_array(jsonb_build_object('row',row->'row','error',SQLERRM));
    END;
  END LOOP;
  UPDATE public.sales_imports SET accepted = added, rejected = rejected_count WHERE id = batch_id;
  RETURN jsonb_build_object('import_id',batch_id,'accepted',added,'rejected',rejected_count,'errors',errors);
END $$;

CREATE OR REPLACE FUNCTION public.sales_update_lead(p_id uuid, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE lead public.sales_leads; owner_id uuid; r text := public.sales_actor_role(); changed_owner boolean;
BEGIN
  SELECT * INTO lead FROM public.sales_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_access(p_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF (p->>'version')::integer IS DISTINCT FROM lead.version THEN RAISE EXCEPTION 'Lead changed since you opened it. Refresh and try again.'; END IF;
  IF r <> 'admin' THEN RAISE EXCEPTION 'Only admins can change contact details, assignment, or archive state' USING ERRCODE = '42501'; END IF;
  owner_id := CASE WHEN p ? 'assigned_to' THEN nullif(p->>'assigned_to','')::uuid ELSE lead.assigned_to END;
  changed_owner := owner_id IS DISTINCT FROM lead.assigned_to;
  IF owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = owner_id AND role::text IN ('sales','admin')
      AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'Active')) <> 'inactive'
  ) THEN RAISE EXCEPTION 'Select an active sales user'; END IF;
  IF changed_owner AND EXISTS (SELECT 1 FROM public.sales_meetings WHERE lead_id = p_id AND status = 'Scheduled')
    THEN RAISE EXCEPTION 'Cancel the scheduled meeting before changing the lead assignment'; END IF;
  UPDATE public.sales_leads SET name = coalesce(nullif(btrim(p->>'name'),''),name),
    phone = coalesce(p->>'phone',phone), phone_key = public.sales_phone_key(coalesce(p->>'phone',phone)),
    email = CASE WHEN p ? 'email' THEN nullif(p->>'email','') ELSE email END,
    assigned_to = owner_id,
    status = CASE WHEN p->>'reopen' = 'true' THEN 'New' ELSE status END,
    archived_at = CASE WHEN p ? 'archived' THEN CASE WHEN (p->>'archived')::boolean THEN now() ELSE NULL END ELSE archived_at END,
    version = version + 1, updated_at = now() WHERE id = p_id RETURNING * INTO lead;
  IF changed_owner THEN
    UPDATE public.sales_followups SET user_id = owner_id WHERE lead_id = p_id AND status = 'Pending' AND owner_id IS NOT NULL;
    IF owner_id IS NULL THEN UPDATE public.sales_followups SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Pending'; END IF;
  END IF;
  IF lead.archived_at IS NOT NULL THEN
    UPDATE public.sales_followups SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Pending';
    UPDATE public.sales_meetings SET status = 'Cancelled' WHERE lead_id = p_id AND status = 'Scheduled';
  END IF;
  INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark)
    VALUES (p_id,auth.uid(),CASE WHEN changed_owner THEN 'assignment' ELSE 'contact' END,lead.status,
      CASE WHEN changed_owner THEN 'Lead assignment updated' ELSE 'Lead details updated' END);
  RETURN to_jsonb(lead);
END $$;

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
  remark_text := btrim(p->>'remark');
  IF remark_text IS NULL OR length(remark_text) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'A remark between 1 and 5000 characters is required'; END IF;
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

CREATE OR REPLACE FUNCTION public.sales_update_followup(p_id uuid, p_action text, p_due timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE reminder public.sales_followups; lead public.sales_leads;
BEGIN
  SELECT * INTO reminder FROM public.sales_followups WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_access(reminder.lead_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF reminder.status <> 'Pending' THEN RAISE EXCEPTION 'Reminder has already been handled'; END IF;
  IF p_action = 'complete' THEN
    UPDATE public.sales_followups SET status = 'Completed' WHERE id = p_id RETURNING * INTO reminder;
  ELSIF p_action = 'snooze' AND p_due > now() THEN
    UPDATE public.sales_followups SET due_at = p_due,notified_at = NULL WHERE id = p_id RETURNING * INTO reminder;
  ELSE RAISE EXCEPTION 'Choose complete or a future snooze time'; END IF;
  SELECT * INTO lead FROM public.sales_leads WHERE id = reminder.lead_id;
  INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark,due_at)
    VALUES(lead.id,auth.uid(),'reminder',lead.status,'Reminder ' || p_action,reminder.due_at);
  RETURN to_jsonb(reminder);
END $$;

CREATE OR REPLACE FUNCTION public.sales_daily_eod(p_date date, p_user uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, user_name text, dialed bigint, connected bigint, interested bigint, non_interested bigint, meeting_scheduled bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r text := public.sales_actor_role();
BEGIN
  IF r IS NULL OR (r = 'sales' AND p_user IS NOT NULL AND p_user <> auth.uid())
    THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, coalesce(p.name,p.full_name,p.email,'Sales user')::text,
      count(a.id), count(a.id) FILTER(WHERE a.connected),
      count(a.id) FILTER(WHERE a.status IN ('Call back later','Follow up','Meeting Schedule','Follow up after meeting')),
      count(a.id) FILTER(WHERE a.status = 'Not Interested'),
      count(a.id) FILTER(WHERE a.status = 'Meeting Schedule')
    FROM public.profiles p
    LEFT JOIN public.sales_activities a ON a.actor_id = p.id AND a.kind = 'call'
      AND a.created_at >= (p_date::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND a.created_at < ((p_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    WHERE (p.role::text = 'sales' OR a.id IS NOT NULL)
      AND (r = 'admin' OR p.id = auth.uid()) AND (p_user IS NULL OR p.id = p_user)
    GROUP BY p.id,p.name,p.full_name,p.email ORDER BY coalesce(p.name,p.full_name,p.email);
END $$;

-- Reuse the existing Meeting Notes editor for notes linked to owned sales leads.
DROP POLICY IF EXISTS sales_meeting_notes_read ON public.client_meetings;
CREATE POLICY sales_meeting_notes_read ON public.client_meetings FOR SELECT TO authenticated
  USING (public.sales_actor_role() = 'sales' AND EXISTS (
    SELECT 1 FROM public.sales_meetings sm WHERE sm.meeting_note_id = client_meetings.id AND public.sales_can_access(sm.lead_id)
  ));
DROP POLICY IF EXISTS sales_meeting_notes_update ON public.client_meetings;
CREATE POLICY sales_meeting_notes_update ON public.client_meetings FOR UPDATE TO authenticated
  USING (public.sales_actor_role() = 'sales' AND created_by = auth.uid() AND status <> 'Finalized'
    AND EXISTS (SELECT 1 FROM public.sales_meetings sm WHERE sm.meeting_note_id = client_meetings.id AND public.sales_can_access(sm.lead_id)))
  WITH CHECK (public.sales_actor_role() = 'sales' AND created_by = auth.uid() AND client_id IS NULL);

REVOKE ALL ON FUNCTION public.sales_actor_role(), public.sales_can_access(uuid), public.sales_phone_key(text),
  public.sales_create_lead(jsonb), public.sales_import_leads(jsonb,text,uuid), public.sales_update_lead(uuid,jsonb),
  public.sales_record_activity(uuid,jsonb), public.sales_update_followup(uuid,text,timestamptz), public.sales_daily_eod(date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_actor_role(), public.sales_can_access(uuid), public.sales_phone_key(text),
  public.sales_create_lead(jsonb), public.sales_import_leads(jsonb,text,uuid), public.sales_update_lead(uuid,jsonb),
  public.sales_record_activity(uuid,jsonb), public.sales_update_followup(uuid,text,timestamptz), public.sales_daily_eod(date,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
