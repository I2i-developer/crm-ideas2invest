-- ================================================================
-- TASK MANAGEMENT MODULE - SUPABASE DATABASE SCHEMA
-- i2i-dochub | Ideas2Invest
-- ================================================================

-- ================================================================
-- 1. TASKS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number TEXT UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'Internal',
  priority VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'On Hold')),
  due_date DATE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  tags TEXT[],
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all tasks" ON tasks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Operations can view assigned tasks" ON tasks
  FOR SELECT USING (auth.role() = 'authenticated');

-- ================================================================
-- 2. TASK ASSIGNMENTS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage task assignments" ON task_assignments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view their task assignments" ON task_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

-- ================================================================
-- 3. TASK COMMENTS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage task comments" ON task_comments
  FOR ALL USING (auth.role() = 'authenticated');

-- ================================================================
-- 4. TASK ATTACHMENTS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage task attachments" ON task_attachments
  FOR ALL USING (auth.role() = 'authenticated');

-- ================================================================
-- 5. TASK ACTIVITY LOGS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task activity logs" ON task_activity_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert task activity logs" ON task_activity_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ================================================================
-- 6. TASK CHECKLIST TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  item_text VARCHAR(500) NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage task checklist" ON task_checklist
  FOR ALL USING (auth.role() = 'authenticated');

-- ================================================================
-- 7. TASK NOTIFICATIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their notifications" ON task_notifications
  FOR ALL USING (auth.role() = 'authenticated');

-- ================================================================
-- 8. AUTO-GENERATE TASK NUMBER TRIGGER
-- ================================================================
CREATE OR REPLACE FUNCTION generate_task_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.task_number = 'TSK-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('task_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for task numbers
CREATE SEQUENCE IF NOT EXISTS task_number_seq START 1;

DROP TRIGGER IF EXISTS tasks_generate_task_number ON tasks;
CREATE TRIGGER tasks_generate_task_number
  BEFORE INSERT ON tasks
  FOR EACH ROW
  WHEN (NEW.task_number IS NULL)
  EXECUTE FUNCTION generate_task_number();

-- ================================================================
-- 9. UPDATED_AT TRIGGER
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- 10. INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user_id ON task_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_logs_task_id ON task_activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task_id ON task_checklist(task_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_user_id ON task_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_is_read ON task_notifications(is_read);

-- ================================================================
-- 11. SEED DATA (Optional - for testing)
-- ================================================================
-- Insert sample tasks (run after creating test users)
-- INSERT INTO tasks (title, description, category, priority, status, due_date, created_by)
-- VALUES
--   ('Review KYC Documents', 'Review and validate all pending KYC documents for new clients', 'KYC', 'High', 'Pending', CURRENT_DATE + 7, NULL),
--   ('Follow up with Clients', 'Follow up with clients who have pending document submissions', 'Follow-up', 'Medium', 'In Progress', CURRENT_DATE + 3, NULL),
--   ('System Audit', 'Conduct monthly audit of all client records', 'Internal', 'Low', 'Pending', CURRENT_DATE + 30, NULL);
