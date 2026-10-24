CREATE TABLE IF NOT EXISTS public.operation_eod_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.operation_eod_reports(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2500),
  review_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operation_eod_replies_report_idx
  ON public.operation_eod_replies(report_id, created_at);

ALTER TABLE public.operation_eod_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View accessible EOD replies" ON public.operation_eod_replies;
CREATE POLICY "View accessible EOD replies" ON public.operation_eod_replies
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.operation_eod_reports r
      WHERE r.id = report_id AND r.created_by = auth.uid() AND r.operation_hidden_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Operations reply to own review" ON public.operation_eod_replies;
CREATE POLICY "Operations reply to own review" ON public.operation_eod_replies
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'operations')
    AND EXISTS (
      SELECT 1 FROM public.operation_eod_reports r
      WHERE r.id = report_id AND r.created_by = auth.uid()
        AND r.operation_hidden_at IS NULL AND nullif(btrim(r.review_note), '') IS NOT NULL
        AND r.review_note = operation_eod_replies.review_note
    )
  );
