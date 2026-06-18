-- Internal CRM chat: direct/group threads, members, messages, and RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_type TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (thread_type IN ('direct', 'group'))
);

CREATE TABLE IF NOT EXISTS chat_thread_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_snapshot TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  muted BOOLEAN DEFAULT FALSE,
  UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_chat_thread_members_user_id ON chat_thread_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread_members_thread_id ON chat_thread_members(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_message_at ON chat_threads(last_message_at DESC);

DROP TRIGGER IF EXISTS chat_threads_updated_at ON chat_threads;
CREATE TRIGGER chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.is_chat_thread_member(target_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_thread_members ctm
    WHERE ctm.thread_id = target_thread_id
      AND ctm.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_add_chat_thread_member(target_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM chat_threads ct
    WHERE ct.id = target_thread_id
      AND ct.created_by = auth.uid()
  )
  OR public.is_admin()
$$;

CREATE OR REPLACE FUNCTION public.touch_chat_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_threads
  SET last_message_at = NEW.created_at,
      updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON chat_messages;
CREATE TRIGGER chat_messages_touch_thread
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_thread();

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create chat threads" ON chat_threads;
CREATE POLICY "Users can create chat threads" ON chat_threads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS "Users can view member chat threads" ON chat_threads;
CREATE POLICY "Users can view member chat threads" ON chat_threads
  FOR SELECT USING (public.is_chat_thread_member(id));

DROP POLICY IF EXISTS "Users can update member chat threads" ON chat_threads;
CREATE POLICY "Users can update member chat threads" ON chat_threads
  FOR UPDATE USING (public.is_chat_thread_member(id))
  WITH CHECK (public.is_chat_thread_member(id));

DROP POLICY IF EXISTS "Users can view chat members in their threads" ON chat_thread_members;
CREATE POLICY "Users can view chat members in their threads" ON chat_thread_members
  FOR SELECT USING (public.is_chat_thread_member(thread_id));

DROP POLICY IF EXISTS "Thread creators can add chat members" ON chat_thread_members;
CREATE POLICY "Thread creators can add chat members" ON chat_thread_members
  FOR INSERT WITH CHECK (public.can_add_chat_thread_member(thread_id));

DROP POLICY IF EXISTS "Users can update their chat membership" ON chat_thread_members;
CREATE POLICY "Users can update their chat membership" ON chat_thread_members
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view messages in member threads" ON chat_messages;
CREATE POLICY "Users can view messages in member threads" ON chat_messages
  FOR SELECT USING (public.is_chat_thread_member(thread_id));

DROP POLICY IF EXISTS "Users can send messages to member threads" ON chat_messages;
CREATE POLICY "Users can send messages to member threads" ON chat_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid() AND public.is_chat_thread_member(thread_id));

DROP POLICY IF EXISTS "Users can edit own chat messages" ON chat_messages;
CREATE POLICY "Users can edit own chat messages" ON chat_messages
  FOR UPDATE USING (sender_id = auth.uid() OR public.is_admin())
  WITH CHECK (sender_id = auth.uid() OR public.is_admin());
