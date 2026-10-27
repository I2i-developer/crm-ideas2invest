-- Additive Sales task creation. No existing tasks or assignments are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.sales_owns_team_task(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.sales_actor_role() = 'sales' AND EXISTS (
    SELECT 1 FROM public.tasks WHERE id = target_id AND created_by = auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.sales_owns_team_task(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_owns_team_task(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_sales_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := coalesce(auth.uid(),NEW.assigned_by); actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = actor;
  IF actor_role = 'sales' THEN
    IF public.sales_actor_role() IS DISTINCT FROM 'sales' AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    IF NEW.assigned_by IS DISTINCT FROM actor OR NEW.user_id = actor OR NOT EXISTS (
      SELECT 1 FROM public.tasks WHERE id = NEW.task_id AND created_by = actor
    ) OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND role IN ('sales','operations')
        AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'active')) <> 'inactive'
    ) THEN RAISE EXCEPTION 'Sales may assign their own tasks only to other active Sales or Operations users' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_sales_task_assignment ON public.task_assignments;
CREATE TRIGGER guard_sales_task_assignment BEFORE INSERT OR UPDATE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_sales_task_assignment();
REVOKE ALL ON FUNCTION public.guard_sales_task_assignment() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sales_create_team_task(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task public.tasks; ids uuid[]; valid_count integer;
BEGIN
  IF public.sales_actor_role() IS DISTINCT FROM 'sales' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p->>'title',''))) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Enter a task title (maximum 255 characters)'; END IF;
  IF coalesce(p->>'client_id','') <> '' OR coalesce(p->>'source_sip_event_id','') <> '' THEN RAISE EXCEPTION 'Sales cannot link back-office records' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p->'assigned_to') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Select task assignees'; END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(p->'assigned_to');
  IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Select 1 to 100 assignees'; END IF;
  SELECT count(*) INTO valid_count FROM public.profiles WHERE id = ANY(ids) AND id <> auth.uid()
    AND role IN ('sales','operations') AND is_active IS DISTINCT FROM false AND lower(coalesce(status,'active')) <> 'inactive';
  IF valid_count <> cardinality(ids) THEN RAISE EXCEPTION 'Assign only to other active Sales or Operations users' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.tasks(task_number,title,description,category,priority,status,due_date,tags,created_by)
    VALUES('TSK-' || to_char(now(),'YYYYMM') || '-' || upper(substr(gen_random_uuid()::text,1,8)),btrim(p->>'title'),p->>'description',coalesce(nullif(p->>'category',''),'Internal'),
      coalesce(nullif(p->>'priority',''),'Medium'),'Pending',nullif(p->>'due_date','')::date,
      CASE WHEN jsonb_typeof(p->'tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p->'tags')) ELSE ARRAY[]::text[] END,auth.uid()) RETURNING * INTO task;
  INSERT INTO public.task_assignments(task_id,user_id,assigned_by) SELECT task.id,id,auth.uid() FROM unnest(ids) id;
  RETURN to_jsonb(task);
END $$;
REVOKE ALL ON FUNCTION public.sales_create_team_task(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_create_team_task(jsonb) TO authenticated;

DROP POLICY IF EXISTS "Sales can read created team tasks" ON public.tasks;
CREATE POLICY "Sales can read created team tasks" ON public.tasks FOR SELECT TO authenticated USING (public.sales_owns_team_task(id));
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['task_assignments','task_comments','task_checklist','task_activity_logs','task_attachments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS sales_created_task_read ON public.%I',table_name);
    EXECUTE format('CREATE POLICY sales_created_task_read ON public.%I FOR SELECT TO authenticated USING (public.sales_owns_team_task(task_id))',table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS sales_created_task_comment ON public.task_comments;
CREATE POLICY sales_created_task_comment ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (public.sales_owns_team_task(task_id) AND user_id = auth.uid());
NOTIFY pgrst,'reload schema';
COMMIT;
