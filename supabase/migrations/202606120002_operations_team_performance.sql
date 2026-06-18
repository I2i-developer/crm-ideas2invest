-- Operations Team Performance Tracker task lifecycle fields.

ALTER TABLE IF EXISTS tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE IF EXISTS tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('Pending', 'In Progress', 'Follow-up', 'Waiting for Approval', 'Completed', 'On Hold', 'Cancelled'));

UPDATE tasks task
SET completed_at = completion.completed_at
FROM (
  SELECT task_id, MAX(created_at) AS completed_at
  FROM task_activity_logs
  WHERE action_type = 'status_changed_to_Completed'
  GROUP BY task_id
) completion
WHERE task.id = completion.task_id
  AND task.status = 'Completed'
  AND task.completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_by ON tasks(completed_by);

-- Admin-only tracker reads use the existing protected server API. This policy
-- keeps direct table access aligned if the app later queries Supabase directly.
DROP POLICY IF EXISTS "Admins can view operation self tasks for performance" ON operation_self_tasks;
CREATE POLICY "Admins can view operation self tasks for performance" ON operation_self_tasks
  FOR SELECT USING (public.is_admin());
