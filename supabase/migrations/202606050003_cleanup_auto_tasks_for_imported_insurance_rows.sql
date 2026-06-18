-- Remove insurance follow-up tasks that were automatically generated for
-- imported insurance rows. Imported insurance policy rows are intentionally
-- preserved; future client/task creation is explicit from the Insurance page.

CREATE TEMP TABLE cleanup_imported_insurance_policies ON COMMIT DROP AS
SELECT id
FROM insurance_policies
WHERE import_id IS NOT NULL;

CREATE TEMP TABLE cleanup_imported_insurance_tasks ON COMMIT DROP AS
SELECT DISTINCT t.id
FROM tasks t
JOIN insurance_renewal_alerts ira ON ira.task_id = t.id
WHERE ira.policy_id IN (SELECT id FROM cleanup_imported_insurance_policies);

DELETE FROM task_notifications
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks)
   OR (
    entity_type = 'insurance_policy'
    AND entity_id IN (SELECT id FROM cleanup_imported_insurance_policies)
    AND notification_type = 'insurance_renewal_followup'
   );

DELETE FROM insurance_renewal_alerts
WHERE policy_id IN (SELECT id FROM cleanup_imported_insurance_policies)
   OR task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM task_activity_logs
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM task_checklist
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM task_comments
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM task_attachments
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM task_assignments
WHERE task_id IN (SELECT id FROM cleanup_imported_insurance_tasks);

DELETE FROM tasks
WHERE id IN (SELECT id FROM cleanup_imported_insurance_tasks);
