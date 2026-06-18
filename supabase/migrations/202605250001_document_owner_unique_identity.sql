-- Replace older document uniqueness rules that only considered the client and
-- document label. Holder-wise onboarding needs uniqueness by requirement owner.

DO $$
BEGIN
  IF to_regclass('public.documents') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_client_document'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT unique_client_document;
  END IF;

  IF to_regclass('public.client_documents') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_client_document'
      AND conrelid = 'public.client_documents'::regclass
  ) THEN
    ALTER TABLE client_documents DROP CONSTRAINT unique_client_document;
  END IF;
END $$;

DROP INDEX IF EXISTS unique_client_document;
DROP INDEX IF EXISTS unique_documents_requirement_owner;
DROP INDEX IF EXISTS unique_client_documents_requirement_owner;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        client_id,
        COALESCE(requirement_key, document_type, 'document'),
        COALESCE(owner_type, 'client'),
        COALESCE(holder_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(nominee_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(guardian_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY COALESCE(updated_at, uploaded_at, created_at) DESC NULLS LAST, id DESC
    ) AS row_number
  FROM documents
)
DELETE FROM documents
USING ranked
WHERE documents.id = ranked.id
  AND ranked.row_number > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        client_id,
        COALESCE(requirement_key, document_type, 'document'),
        COALESCE(owner_type, 'client'),
        COALESCE(holder_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(nominee_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(guardian_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY COALESCE(updated_at, uploaded_at, created_at) DESC NULLS LAST, id DESC
    ) AS row_number
  FROM client_documents
)
DELETE FROM client_documents
USING ranked
WHERE client_documents.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX unique_documents_requirement_owner
  ON documents (
    client_id,
    COALESCE(requirement_key, document_type, 'document'),
    COALESCE(owner_type, 'client'),
    COALESCE(holder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(nominee_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(guardian_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE UNIQUE INDEX unique_client_documents_requirement_owner
  ON client_documents (
    client_id,
    COALESCE(requirement_key, document_type, 'document'),
    COALESCE(owner_type, 'client'),
    COALESCE(holder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(nominee_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(guardian_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
