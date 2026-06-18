-- Phase 5: dashboard notifications and holder-wise birthday support.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE task_notifications
  ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS role_target TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_notifications_dedupe
  ON task_notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_notifications_type ON task_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_task_notifications_entity ON task_notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_clients_date_of_birth ON clients(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_client_holders_date_of_birth ON client_holders(date_of_birth);

DROP POLICY IF EXISTS "Users can manage their notifications" ON task_notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON task_notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON task_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON task_notifications;

CREATE POLICY "Users can view own notifications" ON task_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON task_notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications" ON task_notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
