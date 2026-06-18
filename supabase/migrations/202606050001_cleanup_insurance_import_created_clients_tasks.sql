-- Cleanup for the brief insurance import behavior that automatically created
-- CRM clients. This is intentionally narrow and only targets rows carrying the
-- exact marker used by that importer path.

CREATE TEMP TABLE cleanup_insurance_import_clients ON COMMIT DROP AS
SELECT id
FROM clients
WHERE onboarding_status = 'Imported'
  AND notes = 'Created automatically from insurance policy import.';

CREATE TEMP TABLE cleanup_insurance_import_policies ON COMMIT DROP AS
SELECT id, client_id
FROM insurance_policies
WHERE client_id IN (SELECT id FROM cleanup_insurance_import_clients);

CREATE TEMP TABLE cleanup_insurance_import_tasks ON COMMIT DROP AS
SELECT DISTINCT t.id
FROM tasks t
LEFT JOIN insurance_renewal_alerts ira ON ira.task_id = t.id
WHERE t.client_id IN (SELECT id FROM cleanup_insurance_import_clients)
   OR ira.policy_id IN (SELECT id FROM cleanup_insurance_import_policies)
   OR (
    t.category = 'Insurance'
    AND t.title ILIKE 'Follow up: Insurance renewal%'
    AND t.client_id IN (SELECT id FROM cleanup_insurance_import_clients)
   );

DELETE FROM task_notifications
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks)
   OR (
    entity_type = 'insurance_policy'
    AND entity_id IN (SELECT id FROM cleanup_insurance_import_policies)
   )
   OR (
    metadata ? 'client_id'
    AND metadata->>'client_id' IN (
      SELECT id::text FROM cleanup_insurance_import_clients
    )
   );

DELETE FROM insurance_renewal_alerts
WHERE policy_id IN (SELECT id FROM cleanup_insurance_import_policies)
   OR task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM task_activity_logs
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM task_checklist
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM task_comments
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM task_attachments
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM task_assignments
WHERE task_id IN (SELECT id FROM cleanup_insurance_import_tasks);

DELETE FROM tasks
WHERE id IN (SELECT id FROM cleanup_insurance_import_tasks);

-- Deleting these clients cascades their imported insurance policies and any
-- remaining client-owned child rows according to the existing schema.
DELETE FROM clients
WHERE id IN (SELECT id FROM cleanup_insurance_import_clients);
