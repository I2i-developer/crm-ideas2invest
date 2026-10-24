-- Sales temporarily use the same EOD workflow as Operations. No stored rows change.
BEGIN;
DROP POLICY IF EXISTS "Sales reply to own EOD review" ON public.operation_eod_replies;
CREATE POLICY "Sales reply to own EOD review" ON public.operation_eod_replies
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'sales')
    AND EXISTS (
      SELECT 1 FROM public.operation_eod_reports r
      WHERE r.id = report_id AND r.created_by = auth.uid()
        AND r.operation_hidden_at IS NULL AND nullif(btrim(r.review_note), '') IS NOT NULL
        AND r.review_note = operation_eod_replies.review_note
    )
  );
COMMIT;
