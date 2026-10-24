-- Apply after sales workspace and sales sources. No existing work records are modified.
BEGIN;
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS address text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_leads'::regclass AND conname = 'sales_leads_address_length_check') THEN
    ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_address_length_check CHECK (address IS NULL OR length(address) <= 1000);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.id,l.name,l.phone,l.phone_key,l.email,l.status,l.rnr_count,l.assigned_to,l.created_by,l.import_id,l.source,l.version,l.archived_at,l.created_at,l.updated_at,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
       'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
     FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
     WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due,
    l.source_id,l.address
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
  INSERT INTO public.sales_leads(name,phone,phone_key,email,assigned_to,created_by,source,source_id,status,rnr_count,import_id,address)
    VALUES (btrim(p->>'name'),btrim(p->>'phone'),key,nullif(btrim(p->>'email'),''),owner_id,auth.uid(),
      (SELECT name FROM public.sales_sources WHERE id = source_uuid),source_uuid,
      CASE WHEN batch_id IS NOT NULL THEN coalesce(p->>'status','New') ELSE 'New' END,
      CASE WHEN batch_id IS NOT NULL AND p->>'status' ~ '^RNR-[1-6]$' THEN right(p->>'status',1)::integer ELSE 0 END,batch_id,nullif(btrim(p->>'address'),''))
    RETURNING * INTO lead;
  INSERT INTO public.sales_activities(lead_id,actor_id,kind,status,remark,metadata)
    VALUES (lead.id,auth.uid(),CASE WHEN batch_id IS NULL THEN 'contact' ELSE 'import' END,lead.status,
      coalesce(nullif(left(btrim(p->>'remark'),5000),''),'Lead added'),
      jsonb_build_object('source_done_by',left(p->>'done_by',180),'source_id',source_uuid));
  RETURN to_jsonb(lead);
END $$;

CREATE OR REPLACE FUNCTION public.sales_update_address(p_id uuid,p_version integer,p_address text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lead public.sales_leads; old_address text; label text := nullif(btrim(p_address),'');
BEGIN
  SELECT * INTO lead FROM public.sales_leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sales_can_access(p_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF lead.archived_at IS NOT NULL AND public.sales_actor_role() <> 'admin' THEN RAISE EXCEPTION 'Archived lead is read-only' USING ERRCODE = '42501'; END IF;
  IF p_version IS DISTINCT FROM lead.version THEN RAISE EXCEPTION 'Lead changed since you opened it. Refresh and try again.'; END IF;
  IF length(label) > 1000 THEN RAISE EXCEPTION 'Address must be at most 1000 characters'; END IF;
  IF label IS NOT DISTINCT FROM lead.address THEN RETURN to_jsonb(lead); END IF;
  old_address := lead.address;
  UPDATE public.sales_leads SET address = label,version = version + 1,updated_at = now() WHERE id = p_id RETURNING * INTO lead;
  INSERT INTO public.sales_activities(lead_id,actor_id,kind,previous_status,status,remark,metadata)
    VALUES (p_id,auth.uid(),'contact',lead.status,lead.status,'Address updated',jsonb_build_object('field','address','old_address',old_address,'address',label));
  RETURN to_jsonb(lead);
END $$;
REVOKE ALL ON FUNCTION public.sales_update_address(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_update_address(uuid,integer,text) TO authenticated;

-- A role change must not remove read access to the user's historical EOD reports.
DROP POLICY IF EXISTS "Sales can view own historical EOD reports" ON public.operation_eod_reports;
CREATE POLICY "Sales can view own historical EOD reports" ON public.operation_eod_reports FOR SELECT TO authenticated
  USING (created_by = auth.uid() AND public.sales_actor_role() = 'sales');
NOTIFY pgrst, 'reload schema';
COMMIT;
