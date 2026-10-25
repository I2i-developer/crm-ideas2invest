-- Append read-only first-work attribution. No existing lead or activity records are changed.
BEGIN;
CREATE INDEX IF NOT EXISTS sales_activities_first_work_idx ON public.sales_activities(lead_id,created_at,id)
  WHERE kind NOT IN ('import','assignment') AND NOT (kind = 'contact' AND remark = 'Lead added');
CREATE OR REPLACE VIEW public.sales_lead_queue WITH (security_invoker = true) AS
  SELECT l.id,l.name,l.phone,l.phone_key,l.email,l.status,l.rnr_count,l.assigned_to,l.created_by,l.import_id,l.source,l.version,l.archived_at,l.created_at,l.updated_at,
    (SELECT jsonb_build_object('remark',a.remark,'created_at',a.created_at,'actor_id',a.actor_id,'kind',a.kind,
      'done_by',coalesce(p.name,p.full_name,p.email,'Sales user'),'source_done_by',a.metadata->>'source_done_by')
      FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
      WHERE a.lead_id = l.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS latest_activity,
    (SELECT min(f.due_at) FROM public.sales_followups f WHERE f.lead_id = l.id AND f.status = 'Pending') AS next_due,
    l.source_id,l.address,l.assigned_user_ids,
    (SELECT string_agg(p.phone_key,' ' ORDER BY p.position) FROM public.sales_lead_phones p WHERE p.lead_id = l.id) AS phone_search,
    (SELECT jsonb_build_object('actor_id',a.actor_id,'name',coalesce(nullif(btrim(p.name),''),nullif(btrim(p.full_name),''),p.email,'CRM user'),'created_at',a.created_at)
      FROM public.sales_activities a LEFT JOIN public.profiles p ON p.id = a.actor_id
      WHERE a.lead_id = l.id AND a.kind NOT IN ('import','assignment') AND NOT (a.kind = 'contact' AND a.remark = 'Lead added')
      ORDER BY a.created_at,a.id LIMIT 1) AS first_worked_by
  FROM public.sales_leads l;
NOTIFY pgrst,'reload schema';
COMMIT;
