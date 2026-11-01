-- Calendar-specific corrections also cover birthdays imported from static lists.
-- Removing a birthday never deletes its client, holder, or historical source data.
CREATE TABLE IF NOT EXISTS public.birthday_changes (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 200),
  person_name TEXT CHECK (length(btrim(person_name)) BETWEEN 1 AND 200),
  date_of_birth DATE,
  deleted BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_changes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.birthday_changes TO authenticated;

DROP POLICY IF EXISTS "Birthday changes read" ON public.birthday_changes;
CREATE POLICY "Birthday changes read" ON public.birthday_changes
  FOR SELECT TO authenticated USING (public.is_admin() OR public.is_operations());
DROP POLICY IF EXISTS "Birthday changes insert" ON public.birthday_changes;
CREATE POLICY "Birthday changes insert" ON public.birthday_changes
  FOR INSERT TO authenticated WITH CHECK (
    (public.is_admin() OR public.is_operations()) AND updated_by = auth.uid()
  );
DROP POLICY IF EXISTS "Birthday changes update" ON public.birthday_changes;
CREATE POLICY "Birthday changes update" ON public.birthday_changes
  FOR UPDATE TO authenticated USING (public.is_admin() OR public.is_operations())
  WITH CHECK ((public.is_admin() OR public.is_operations()) AND updated_by = auth.uid());
