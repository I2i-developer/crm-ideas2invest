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
   For shared calling-sheet assignments and Sales imports, run
   `supabase/migrations/202610240006_sales_shared_imports.sql` after migration 004.
   It retains existing owners/IDs and backfills each existing lead's shared list
   with its current owner. Run it before deploying these import/access changes.
   Migration 005 remains required separately for Sales EOD review replies.
   Next run `supabase/migrations/202610240007_sales_import_10000.sql` to raise the
   database import limit to 10,000 leads. It only replaces the import function;
   no existing rows are modified.
   Then run `supabase/migrations/202610240008_sales_multiple_phones.sql` for
   multiple phone numbers on one lead. This adds a phone registry, backfills
   existing primary numbers and updates validation triggers/search. It does not
   change existing lead IDs, assignments, timelines, tasks or EOD records.
   Run `supabase/migrations/202610240009_sales_bulk_delete.sql` for admin-only
   selected/source-wide deletion. Installing it does not remove any records.
   Run `supabase/migrations/202610250001_sales_calling_columns.sql` for the
   read-only first-work attribution used by Done by. It does not rewrite history.
   Run `supabase/migrations/202610250002_sales_calling_workspace.sql` for personal
   bookmarks, last-call resume and source-wide chart aggregates. No new npm
   dependencies are needed. Existing clients, leads, tasks and activity are kept.
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
There is no combined lead list. Admins and Sales can use Import sheet > New source to
create a named category, or select a source and use Import sheet to append another
file. Existing source names are case/whitespace-insensitive and cannot be
duplicated. Each import batch retains its filename and source link.
Import sheet is the single import action; Existing source appends another file.
The empty system Manual source is hidden, not deleted. Manual sources with real
leads remain visible to avoid hiding existing work.

Legacy imports are grouped by their original filename; legacy manual leads
retain their source label (normally Manual). Source selection is retained in
the page URL. Clearing other filters does not clear the selected source.
Manually added leads also require a source. Sales accounts see only sources
containing their assigned/shared leads, their own created sources, plus Manual,
and only their own accessible lead counts. Creating a source does not grant
access to leads later assigned exclusively to other users.

Import Excel (.xlsx/.xls) or CSV through the Admin or Sales Import Sheet button.
The first worksheet is selected initially; other worksheets can be selected.
The header must appear within the first 25 rows.

| Column | Requirement |
| --- | --- |
| Name/Entity | Required; maximum 180 characters |
| Phone | Required; one or more numbers separated by semicolons, commas, slashes, pipes or new lines; include country codes outside India |
| Email Address | Optional; valid email if supplied |
| Status | Optional; defaults to New; unknown statuses are rejected |
| Remark | Optional; stored as an import timeline entry |
| Done by | Optional; preserved as original sheet provenance |
| Address | Optional; up to 1000 characters; editable after import |

The preview rejects repeated phone numbers within the file and numbers already
in CRM, including archived leads. Indian formats with +91, 0 prefix, spaces and
dashes normalize to one identity. Shared family/company numbers need deliberate
review before import. Imports do not overwrite existing contacts.
Multiple numbers in one cell stay on one lead; the first is the primary number.
Repeated formats of the same number inside that cell are collapsed. All numbers
are validated, searchable and available as separate call links in the lead details.
If any number overlaps another lead/file row, the row remains rejected under the
existing duplicate rule; numbers are not silently dropped or merged into other leads.
Duplicate checks span all sources: a repeated phone is rejected, not moved into
the new source. Appending keeps existing owners, statuses, remarks and reminders
unchanged. Only newly accepted leads receive the selected shared assignees.

Up to 10,000 leads / 10 MB may be imported at once. Only valid preview rows are
saved; uniqueness is rechecked transactionally at save time. Select multiple
active Sales/Admin users: every selected user has access to every accepted lead,
not a split of the file. One lead/status/timeline is shared, not copied. The first
selected user is the meeting coordinator (keeps the legacy single-owner field).
Sales defaults to the importer; Admin can leave leads unassigned. Empty Sales
assignments submitted directly to the API also default to the importer. Operations
and inactive users cannot be selected. Imports cannot reassign existing leads.
Admins can later change the full shared list in Manage lead. Scheduled meetings
must be cancelled before any assignment change. A legacy single-owner update
replaces the shared list with that owner, rather than leaving stale access behind.

Original Done by text never grants access or determines ownership. New activity
uses the authenticated user's identity. Imported historical statuses do not
invent calls, meeting times, or reminder times. Record/schedule a new activity
to set those dates.

## Workflow and Reporting

### Deleting Imported Leads

Only active Admins can select and permanently delete imported leads, regardless
of whether an Admin or Sales user imported them. Select page selects only the
current page's imported leads; selection persists across pages and resets when
filters/source change. Delete all imported covers the entire selected source,
including archived imports and leads outside the current table filters. Manually
added leads, the source and historical import batch records are retained.

Deletion requires a preview and typed confirmation (DELETE for a selection, or
the source name for all imports). The database checks a fingerprint of the
confirmed IDs, rejecting stale selections rather than deleting unexpected leads.
Both API and database independently enforce Admin access; Sales has no controls.
Calls/remarks, lead meetings, follow-ups, phone registrations and lead notifications
are permanently removed; calculated call/EOD totals change accordingly. Saved
Meeting Notes, submitted manual EOD reports, tasks, clients and other sources are
not deleted. The same database transaction writes an audit log; audit failure
rolls back the deletion. No deletion is run automatically on deployment.

### Daily Workflow

Bookmarks are personal to the authenticated user, with one saved lead per source.
Mark/unmark from a row or lead details. Open bookmark clears table filters,
locates the correct queue page and highlights the row without opening details.
Resume last call opens details for the latest successful call recorded by that user in that source,
including calls made before this migration. Imported rows, notes alone and
failed activity saves do not move last-call progress. Archive, reassignment or
deletion makes an inaccessible checkpoint unavailable; users cannot access
another user's bookmarks. Bookmarking never changes Done by or lead activity.

The last selected available source is remembered per user on that browser; no
lead names or phone numbers are stored in this device preference.
Calling overview uses source-wide aggregates rather than the 50-row table page.
Lead status counts active accessible leads; Calling activity stacks connected
and unconnected actual calls over seven India-time days. Sales sees only their
own calling activity and accessible leads; Admin sees the source's team totals.
The overview can be collapsed to keep the calling queue in view. Tool actions
use CrmTooltip rather than native HTML title attributes.

The calling queue shows Name/Entity, Phone Number (with a separate copy button
for each number), Address, Status/Follow-up, Latest Remark, Done by and actions.
Done by is the earliest actual CRM worker, not the importer or current assignee.
Import and assignment entries and the automatic initial "Lead added" placeholder
do not count. Calls, remarks, meeting actions, address/contact edits and reminder
changes count. A user-provided initial remark on manual creation also counts.
Later work by another user updates Latest Remark without replacing Done by.
Untouched leads show a dash. Full actor/import provenance remains in the timeline.

- Sales users can view and log activity only for their assigned/shared leads.
  Shared leads, their calendar, pending follow-ups and meeting notes are visible
  to all assignees. The meeting coordinator remains responsible for bookings and
  overlap checks; shared access does not make every assignee a meeting attendee.
  Due reminders notify all active assignees, once per user per reminder time.
  Concurrent activity uses the existing version checks to prevent overwrites.
  Meeting-note edit/finalization permissions remain unchanged.
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

### Calling Desk Refinements

Apply `202610270001_sales_calling_updates.sql` after the preceding migrations.
It permits empty call remarks (notes/meeting activities still require remarks),
retires Do Not Call for new activities and adds role-scoped, paged call history
for the activity cards. No saved lead/activity/reminder rows are rewritten.
Existing Do Not Call leads keep their status and closed-for-calling protection.

The Lead status chart now counts contacted active leads, split into retry,
follow-up, scheduled/completed meetings, not interested and other closed outcomes.
Metric drill-downs use the same IST date, source, actor and outcome rules as EOD;
they show call attempts, not a snapshot of current lead statuses. Inaccessible
historical leads are masked while their call counts remain accurate.

Calling Desk reminders appear in Self Reminders as a live read-through of
sales_followups, not copied rows. Completion/snooze uses the existing Calling
Desk API. The Calling Desk link opens the corresponding lead. Cancel/delete and
reopen remain personal-reminder-only controls; calling history is not deleted.
Sales task assignment and Admin visibility continue through the existing Tasks
module. WhatsApp uses country-coded wa.me links per phone; no package is needed.

Apply `202610260001_sales_team_tasks.sql` after the preceding migrations for
Sales task creation. Sales can assign to other active Sales/Operations accounts,
not themselves or Admin, and track/comment on their created tasks. Reassignment,
full edits and deletion remain Admin-only. Client/SIP linking is not exposed to
Sales. Creation and assignments commit atomically through an authenticated RPC;
the assignment trigger also rejects forbidden recipients on direct writes.
Existing task data is unchanged. No npm packages are required.

Account Settings includes Notification sound and Test notification sound.
Foreground chimes unlock on a user interaction and play once for each new
allowed notification, independently of toast preferences. Older notifications
and hidden-page events do not chime. Cross-tab deduplication uses Web Locks when
available and a bounded device-local list of notification IDs. Background push
requests the normal OS alert sound; browser autoplay restrictions, silent mode,
Focus/Do Not Disturb and OS notification settings cannot be overridden by CRM.
No extra database column is needed: the preference uses profiles.notifications.

Browser/PWA code cannot guarantee black screenshots across devices. Do not
describe print/copy restrictions or a visibility overlay as screenshot blocking.
For capture controls, evaluate native wrappers/managed devices separately; native
Android FLAG_SECURE is not available to a normal browser page.

Apply `202610250004_sales_quick_notes.sql` after the preceding migrations to
enable own-note Quick Notes access for Sales. Existing notes and Operations/Admin
policies remain unchanged. No npm packages are required.

Sales notification history, unread badges, realtime toasts and web push exclude
back-office categories. Birthday/KYC generation no longer runs for Sales;
tasks, chat, personal reminders and sales follow-ups remain available. Existing
notification records are retained, not deleted. The legacy task-notifications
URL uses the same role-aware API.

Apply `202610250003_sales_calling_refinements.sql` after the earlier Sales
migrations. It updates bookmark positions for 50-row queue pages and adds
read-only Sales access to company details. It does not delete or rewrite leads,
activities, EOD reports, or saved bookmarks. No npm packages are required.

Only the saved bookmark button remains visible within its source; remove it
before choosing another lead. Open bookmark resets table filters and navigates
to its current page, scrolls to the row and highlights it without opening the
lead dialog. Bookmarks remain personal and source-specific.

The Sales dashboard shares the source-scoped calling overview charts with the
Calling Desk. Sales can open Company from the sidebar but cannot access the
credential section or its API. Operations/Admin credential access is unchanged.

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
