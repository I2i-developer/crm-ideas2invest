-- Nominees only require the front side of Aadhaar.

UPDATE document_requirements
SET active = FALSE, updated_at = NOW()
WHERE owner_type = 'nominee'
  AND requirement_key IN ('aadhaar_back', 'aadhaar_card');

INSERT INTO document_requirements
  (tax_status, holding_pattern, owner_type, owner_role, requirement_key, label, is_document, is_data_point, is_mandatory, sort_order, active)
SELECT tax_status, holding_pattern, owner_type, owner_role, 'aadhaar_front', REPLACE(label, 'Aadhaar Card', 'Aadhaar Front'), TRUE, FALSE, is_mandatory, sort_order, TRUE
FROM document_requirements
WHERE owner_type = 'nominee'
  AND requirement_key = 'aadhaar_card'
ON CONFLICT (tax_status, holding_pattern, owner_type, owner_role, requirement_key)
DO UPDATE SET label = EXCLUDED.label, active = TRUE, updated_at = NOW();
