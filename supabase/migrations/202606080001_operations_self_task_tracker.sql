-- Operations Self Task Tracker.
-- This table is intentionally separate from the admin-assigned task system.

CREATE TABLE IF NOT EXISTS operation_self_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task_description TEXT NOT NULL,
  remark TEXT,
  done_by JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pending',
  priority TEXT DEFAULT 'Medium',
  metadata JSONB DEFAULT '{}'::jsonb,
  is_archived BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operation_self_tasks_status_check'
  ) THEN
    ALTER TABLE operation_self_tasks ADD CONSTRAINT operation_self_tasks_status_check
      CHECK (status IN ('Pending', 'In progress', 'Done', 'On hold', 'Cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operation_self_tasks_priority_check'
  ) THEN
    ALTER TABLE operation_self_tasks ADD CONSTRAINT operation_self_tasks_priority_check
      CHECK (priority IN ('Low', 'Medium', 'High'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS operation_self_tasks_updated_at ON operation_self_tasks;
CREATE TRIGGER operation_self_tasks_updated_at
  BEFORE UPDATE ON operation_self_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_operation_self_tasks_created_by
  ON operation_self_tasks(created_by, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_operation_self_tasks_status
  ON operation_self_tasks(status);
CREATE INDEX IF NOT EXISTS idx_operation_self_tasks_task_date
  ON operation_self_tasks(task_date DESC);
CREATE INDEX IF NOT EXISTS idx_operation_self_tasks_client_name
  ON operation_self_tasks(client_name);
CREATE INDEX IF NOT EXISTS idx_operation_self_tasks_archived
  ON operation_self_tasks(is_archived);

ALTER TABLE operation_self_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all operation self tasks" ON operation_self_tasks;
CREATE POLICY "Admins can view all operation self tasks" ON operation_self_tasks
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Operations can view own self tasks" ON operation_self_tasks;
CREATE POLICY "Operations can view own self tasks" ON operation_self_tasks
  FOR SELECT USING (public.is_operations() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Operations can create own self tasks" ON operation_self_tasks;
CREATE POLICY "Operations can create own self tasks" ON operation_self_tasks
  FOR INSERT WITH CHECK (public.is_operations() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Operations can update own self tasks" ON operation_self_tasks;
CREATE POLICY "Operations can update own self tasks" ON operation_self_tasks
  FOR UPDATE USING (
    (public.is_operations() AND created_by = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    (public.is_operations() AND created_by = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete operation self tasks" ON operation_self_tasks;
CREATE POLICY "Admins can delete operation self tasks" ON operation_self_tasks
  FOR DELETE USING (public.is_admin());
