# Sales Workspace

The workspace is at `/sales`. Admins can open it from the Sales sidebar item.
Sales accounts land at `/sales/dashboard` after login and open the Calling Desk
from the sidebar. Operations access is unchanged.

## Deployment

1. Run `supabase/migrations/202610240002_sales_workspace.sql` in the Supabase SQL Editor.
   It adds sales tables, indexes, read policies, transactional write functions, a
   read-only queue view, and support for the Sales role. Existing client, task,
   meeting and operations EOD rows are not updated or removed.
   Then run `supabase/migrations/202610240003_sales_sources.sql`. This adds source
   categories and links existing imports/leads without removing their data.
   Next run `supabase/migrations/202610240004_sales_tools_addresses.sql`. It adds
   the optional editable lead address and read access to a Sales user's own
   historical Operations EOD reports. It does not change account roles or work
   records.
2. Deploy the code and run `npm ci` on other environments. The new runtime
   dependency is `chrono-node` (already installed in this workspace).
3. Use the existing admin user-provisioning screen to create Sales accounts or
   assign that role to the intended team members. No existing user's role is
   changed automatically.
4. Set a strong `CRON_SECRET` and ensure `SUPABASE_SERVICE_ROLE_KEY` is configured
   on the server. Neither value belongs in a `NEXT_PUBLIC_` variable.
5. Configure the hosting scheduler to call `GET /api/sales/dispatch` every minute,
   with `Authorization: Bearer <CRON_SECRET>`. The endpoint sends existing
   in-app/web-push notifications for due follow-ups and meeting reminders.
   It processes 200 due reminders per invocation; call more frequently if a
   backlog develops. The existing notifications endpoint also checks reminders
   for the current user. Background delivery while the CRM is closed requires
   the scheduler and the device's existing push subscription.

Do not run the disposable SQL test database against a live Supabase project.
The application does not run migrations automatically.

## Calling Sheet

Select a source before opening its calling queue, follow-ups, meetings or EOD.
There is no combined lead list. Admins can use Import sheet > New source to
create a named category, or select a source and use Add data to append another
file. Existing source names are case/whitespace-insensitive and cannot be
duplicated. Each import batch retains its filename and source link.

Legacy imports are grouped by their original filename; legacy manual leads
retain their source label (normally Manual). Source selection is retained in
the page URL. Clearing other filters does not clear the selected source.
Manually added leads also require a source. Sales accounts see only sources
containing their assigned leads, plus Manual, and only their own source counts.

Import Excel (.xlsx/.xls) or CSV through the admin Import Sheet button.
The first worksheet is selected initially; other worksheets can be selected.
The header must appear within the first 25 rows.

| Column | Requirement |
| --- | --- |
| Name/Entity | Required; maximum 180 characters |
| Phone | Required; one number per row; include country code outside India |
| Email Address | Optional; valid email if supplied |
| Status | Optional; defaults to New; unknown statuses are rejected |
| Remark | Optional; stored as an import timeline entry |
| Done by | Optional; preserved as original sheet provenance |
| Address | Optional; up to 1000 characters; editable after import |

The preview rejects repeated phone numbers within the file and numbers already
in CRM, including archived leads. Indian formats with +91, 0 prefix, spaces and
dashes normalize to one identity. Shared family/company numbers need deliberate
review before import. Imports do not overwrite existing contacts.
Duplicate checks span all sources: a repeated phone is rejected, not moved into
the new source. Appending keeps existing owners, statuses, remarks and reminders
unchanged. Only newly accepted leads receive the selected import owner.

Up to 5000 leads / 10 MB may be imported at once. Only valid preview rows are
saved; uniqueness is rechecked transactionally at save time. Choose an owner
or leave the new leads unassigned for later admin assignment.

Original Done by text never grants access or determines ownership. New activity
uses the authenticated user's identity. Imported historical statuses do not
invent calls, meeting times, or reminder times. Record/schedule a new activity
to set those dates.

## Workflow and Reporting

- Sales users can view and log activity only for their assigned leads.
- Sales have a personal dashboard, Self Reminders, Calculators and Required Docs.
  Every dashboard query is scoped to the logged-in user's ID; the layout follows
  the Operations dashboard without exposing Operations-wide client/SIP data.
  Sales reminders are personal and cannot be linked to arbitrary back-office
  clients. Calculator and Required Docs administration stays admin-only.
- Lead addresses can be edited inline by the assigned Sales user or an admin.
  Saves check the lead version, record an activity/audit entry, and cannot modify
  assignment, contact fields, source or status. Archived leads are read-only for
  Sales users.
- Active Sales accounts appear in shared CRM user lists, chat, task assignees,
  team performance, and admin usage PDFs. Sales users can open and update their
  assigned tasks, but task creation, reassignment and deletion remain admin-only.
  Sales usage time is recorded from deployment onward; missing historical time
  is not reconstructed. Sales EOD remains separate from Operations EOD, with a
  Sales EOD link on the admin Operations EOD page.
- Admins manage contact details, assignment, archive/restore and reopening.
- RNR advances from RNR-1 to RNR-6; further unanswered attempts stay RNR-6.
  RNR follow-up timing is optional and explicitly selected.
- Call Busy sets a reminder three days later; Switched off sets one week later.
- Callback/Follow up/Follow up after meeting require a confirmed future time.
  English phrases such as "after 2 hours", "at 3 pm" and "tomorrow at 11" produce
  a suggested time in IST. Ambiguous/unrecognized phrases require manual entry.
- Meeting bookings validate start/end times and prevent overlapping bookings
  for the same owner. Booking again reschedules the lead's scheduled meeting
  while preserving the old calendar record as Cancelled. Reassignment requires
  cancelling a scheduled meeting first.
- Completing a meeting requires minutes and saves a linked Draft in the existing
  Meeting Notes module. The link opens the existing review/summary editor.
- Follow-ups can be completed or snoozed. A new call supersedes an outstanding
  callback; closed/archived leads cancel their pending reminders.
- EOD totals are live aggregates of immutable call activities per user per IST day.
  Imports, standalone remarks, reminder updates and meeting-only actions do not
  inflate call totals. Interested/Follow-up counts calls logged as Callback,
  Follow up, Meeting Schedule or Follow up after meeting. Not Interested counts
  that explicit outcome; Meeting Scheduled counts calls with that outcome.
  Repeated calls to one lead count as separate attempts.

## Confidentiality

No lead export, download, public share or print view is provided. API responses
are private/no-store, lead access is enforced in the API and database, printing
and ordinary save shortcuts are suppressed in the workspace, copying outside
editable fields is suppressed, and a named/time-stamped watermark is visible.

Ordinary web apps cannot prevent operating-system screenshots, screen recording,
photographs, browser developer tools or copying data already delivered to an
authorized browser. These measures discourage casual disclosure; they are not
a screenshot-prevention guarantee. Managed devices are needed for enforceable
device-level capture restrictions.

## Verification

For the explicitly requested Jalaj/Rajat role changes, the guarded script is
`node scripts/change-sales-roles.mjs` (read-only preflight). Add `--apply` only
when applying those two named account changes. It preserves Auth/profile IDs,
updates only the CRM role and Auth role metadata, verifies linked record hashes,
and records an audit entry. No user accounts are deleted or recreated. The
`/sales/eod-report` page currently shares the Operations EOD screen and workflow:
submit/edit own reports, hide own reports, and reply to admin reviews. The old
`/sales/eod-history` URL redirects here. Admin review/permanent deletion remain
admin-only. Run `202610240005_sales_eod_parity.sql` to allow own Sales review
replies through database RLS as well. The migration changes no stored records.
Admin EOD filters include users even after their role changes.

`node --experimental-vm-modules --test scripts/test-sales.mjs`

Shared user visibility and assigned-task permissions:
`node --experimental-vm-modules --test scripts/test-user-visibility.mjs`

Source grouping, append imports, legacy backfill and isolation:
`node --experimental-vm-modules --test scripts/test-sales-sources.mjs`

SQL tests are optional and use a disposable in-memory PostgreSQL database.
Install `@electric-sql/pglite` in a separate test-tools directory, point
`PGLITE_MODULE` at its module path, then run the same command.
Tests cover ownership, duplicate numbers, 600+ imports, reminder rules, RNR,
idempotent saves, conflict rollback, meeting-note links and EOD exclusion rules.
