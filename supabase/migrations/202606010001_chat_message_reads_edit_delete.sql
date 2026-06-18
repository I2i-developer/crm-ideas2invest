-- Chat message edit/delete metadata and message-level read receipts.

ALTER TABLE IF EXISTS chat_messages
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS chat_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_message_id ON chat_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_id ON chat_message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_read_at ON chat_message_reads(read_at DESC);

CREATE OR REPLACE FUNCTION public.can_read_chat_message(target_message_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_messages cm
    WHERE cm.id = target_message_id
      AND public.is_chat_thread_member(cm.thread_id)
  )
$$;

ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reads for member chat messages" ON chat_message_reads;
CREATE POLICY "Users can view reads for member chat messages" ON chat_message_reads
  FOR SELECT USING (public.can_read_chat_message(message_id));

DROP POLICY IF EXISTS "Users can mark member chat messages read" ON chat_message_reads;
CREATE POLICY "Users can mark member chat messages read" ON chat_message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.can_read_chat_message(message_id));

DROP POLICY IF EXISTS "Users can update their own chat read receipts" ON chat_message_reads;
CREATE POLICY "Users can update their own chat read receipts" ON chat_message_reads
  FOR UPDATE USING (user_id = auth.uid() AND public.can_read_chat_message(message_id))
  WITH CHECK (user_id = auth.uid() AND public.can_read_chat_message(message_id));
