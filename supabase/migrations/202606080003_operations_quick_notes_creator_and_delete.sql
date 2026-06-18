-- Add a free-form displayed creator name while retaining authenticated
-- created_by ownership for permissions. Allow operations users to permanently
-- delete only their own quick notes.

ALTER TABLE IF EXISTS operation_notes
  ADD COLUMN IF NOT EXISTS creator_name TEXT;

UPDATE operation_notes notes
SET creator_name = COALESCE(
  NULLIF(notes.creator_name, ''),
  (
    SELECT COALESCE(NULLIF(profiles.name, ''), NULLIF(profiles.full_name, ''), profiles.email)
    FROM profiles
    WHERE profiles.id = notes.created_by
  ),
  'Operations user'
)
WHERE creator_name IS NULL OR creator_name = '';

DROP POLICY IF EXISTS "Operations can delete own notes" ON operation_notes;
CREATE POLICY "Operations can delete own notes" ON operation_notes
  FOR DELETE USING (public.is_operations() AND created_by = auth.uid());
