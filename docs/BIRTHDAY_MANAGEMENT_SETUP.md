# Birthday Editing and Deletion

Apply `supabase/migrations/202610310001_birthday_management.sql` in Supabase after the existing CRM migrations. No npm packages or environment variables are required.

- Admin and Operations can edit or delete any birthday visible to them, including imported birthdays and entries created by another user.
- Select a calendar day or search for a person, then use Edit or Delete on their birthday card.
- Edit opens the existing birthday form with the current name and date. Manual DD/MM/YYYY entry and the custom calendar are unchanged.
- Delete requires confirmation and removes the birthday from calendar, search, upcoming birthdays, dashboard counts, and future birthday notification generation.
- Changes are shared across users and audited. Existing notifications are historical records and are not deleted.
- Corrections and deletion markers are stored in `birthday_changes`. Original clients, holders, documents, imported files, and manual source rows are preserved. Editing a calendar entry does not edit the client profile's name or identity date of birth.
- Before the migration is applied, the calendar remains readable and shows a setup message; mutation APIs return an actionable error.
- The calendar queries the existing clients schema without an `is_active` filter (that column is not part of this CRM's clients table). Other source failures show a load error with a retry button, not a migration warning. A migration warning appears only after a successful response explicitly reports the changes table missing.

Regression tests:

```powershell
$env:PGLITE_MODULE = 'C:\path\to\node_modules\@electric-sql\pglite'
node --experimental-vm-modules --test scripts/test-birthday-management.mjs scripts/test-date-input.mjs
```

PGlite is only a disposable local SQL test dependency, not an application dependency. Tests do not connect to Supabase or mutate production data.
