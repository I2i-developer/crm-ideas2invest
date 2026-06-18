-- Operations Quick Notes.
-- Kept separate from tasks, chat messages, and client documents.

CREATE TABLE IF NOT EXISTS operation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT,
  color TEXT DEFAULT 'blue',
  pinned BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS operation_notes_updated_at ON operation_notes;
CREATE TRIGGER operation_notes_updated_at
  BEFORE UPDATE ON operation_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_operation_notes_created_by
  ON operation_notes(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_notes_pinned
  ON operation_notes(created_by, pinned, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_notes_archived
  ON operation_notes(created_by, archived);

ALTER TABLE operation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage operation notes" ON operation_notes;
CREATE POLICY "Admins can manage operation notes" ON operation_notes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Operations can view own notes" ON operation_notes;
CREATE POLICY "Operations can view own notes" ON operation_notes
  FOR SELECT USING (public.is_operations() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Operations can create own notes" ON operation_notes;
CREATE POLICY "Operations can create own notes" ON operation_notes
  FOR INSERT WITH CHECK (public.is_operations() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Operations can update own notes" ON operation_notes;
CREATE POLICY "Operations can update own notes" ON operation_notes
  FOR UPDATE USING (public.is_operations() AND created_by = auth.uid())
  WITH CHECK (public.is_operations() AND created_by = auth.uid());
