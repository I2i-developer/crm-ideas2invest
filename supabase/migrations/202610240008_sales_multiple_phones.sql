-- Apply after 202610240007. Keep existing lead records, primary phones and timelines.
BEGIN;
CREATE OR REPLACE FUNCTION public.sales_phone_keys(p_phone text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE part text; digits text; key text; keys text[] := '{}';
BEGIN
  FOREACH part IN ARRAY regexp_split_to_array(coalesce(p_phone,''),'[;,/|\r\n]+') LOOP
    part := btrim(part);
    IF part = '' THEN CONTINUE; END IF;
    IF part !~ '^[+0-9[:space:]().-]+$' THEN RETURN NULL; END IF;
    digits := regexp_replace(part,'[^0-9]','','g');
    IF length(digits) = 11 AND left(digits,1) = '0' THEN digits := substring(digits FROM 2); END IF;
    IF length(digits) = 10 THEN digits := '91' || digits; END IF;
    IF digits !~ '^[0-9]{8,15}$' THEN RETURN NULL; END IF;
    key := '+' || digits;
    IF NOT key = ANY(keys) THEN keys := array_append(keys,key); END IF;
  END LOOP;
  RETURN CASE WHEN cardinality(keys) > 0 THEN keys ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public.sales_phone_key(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (public.sales_phone_keys(p_phone))[1]
$$;

-- One unique registry covers primary AND additional numbers across all sources.
CREATE TABLE IF NOT EXISTS public.sales_lead_phones (
  phone_key text PRIMARY KEY CHECK (phone_key ~ '^\+[0-9]{8,15}$'),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0)
);
CREATE INDEX IF NOT EXISTS sales_lead_phones_lead_idx ON public.sales_lead_phones(lead_id,position);
INSERT INTO public.sales_lead_phones(phone_key,lead_id,position)
  SELECT phone_key,id,1 FROM public.sales_leads ON CONFLICT (phone_key) DO NOTHING;
ALTER TABLE public.sales_lead_phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_lead_phones_read ON public.sales_lead_phones;
CREATE POLICY sales_lead_phones_read ON public.sales_lead_phones FOR SELECT TO authenticated USING (public.sales_can_access(lead_id));
REVOKE ALL ON public.sales_lead_phones FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sales_lead_phones TO authenticated;
GRANT ALL ON public.sales_lead_phones TO service_role;

CREATE OR REPLACE FUNCTION public.sales_normalize_lead_phones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE keys text[] := public.sales_phone_keys(NEW.phone);
BEGIN
  IF keys IS NULL THEN RAISE EXCEPTION 'Enter valid phone numbers separated by semicolons, commas, slashes or new lines' USING ERRCODE = '23514'; END IF;
  NEW.phone_key := keys[1];
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.sales_sync_lead_phones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.phone IS NOT DISTINCT FROM OLD.phone AND NEW.phone_key IS NOT DISTINCT FROM OLD.phone_key THEN RETURN NEW; END IF;
  END IF;
  DELETE FROM public.sales_lead_phones WHERE lead_id = NEW.id;
  INSERT INTO public.sales_lead_phones(phone_key,lead_id,position)
    SELECT key,NEW.id,ordinality::integer FROM unnest(public.sales_phone_keys(NEW.phone)) WITH ORDINALITY AS numbers(key,ordinality) ORDER BY key;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sales_normalize_lead_phones ON public.sales_leads;
CREATE TRIGGER sales_normalize_lead_phones BEFORE INSERT OR UPDATE OF phone,phone_key ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_normalize_lead_phones();
DROP TRIGGER IF EXISTS sales_sync_lead_phones ON public.sales_leads;
CREATE TRIGGER sales_sync_lead_phones AFTER INSERT OR UPDATE OF phone,phone_key ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_sync_lead_phones();

CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.id,l.name,l.phone,l.phone_key,l.email,l.status,l.rnr_count,l.assigned_to,l.created_by,l.import_id,l.source,l.version,l.archived_at,l.created_at,l.updated_at,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
      'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
      FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
      WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due,
    l.source_id,l.address,l.assigned_user_ids,
    (SELECT string_agg(p.phone_key,' ' ORDER BY p.position) FROM public.sales_lead_phones p WHERE p.lead_id = l.id) AS phone_search
  FROM public.sales_leads l;
REVOKE ALL ON FUNCTION public.sales_phone_keys(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_phone_keys(text) TO authenticated;
REVOKE ALL ON FUNCTION public.sales_normalize_lead_phones(),public.sales_sync_lead_phones() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
