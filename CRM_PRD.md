# Product Requirements Document: Back Office CRM for Mutual Fund Distribution Business

## 1. Document Overview

### Product Name
Back Office CRM for Mutual Fund Distribution, PMS/AIF, GIFT City, and Insurance Operations

### Document Type
Product Requirements Document (PRD)

### Prepared For
Internal CRM development for a financial distribution company dealing in:

- Mutual Funds
- PMS and AIF products
- GIFT City investments
- Insurance products
- Client servicing and operational workflows

### Primary Users

- Admin
- Operations team

### Product Purpose
The CRM will act as a centralized back-office platform for managing clients, documents, tasks, birthdays, credentials, calculators, insurance details, risk profiling, and internal operational workflows. It will replace scattered manual processes with a role-based system where the admin has full control and the operations team can execute assigned work with appropriate access restrictions.

## 2. Business Background

The company currently manages multiple financial product lines and requires a CRM customized to its internal working style. Some features already exist, including:

- Adding new clients
- Storing client details
- Uploading documents into client profiles
- Parsing required information from uploaded documents
- Saving extracted information into client profiles
- Task assignment by admin to operations team members
- Task status updates by operations team
- Notifications for assigned tasks

The next phase is to make the CRM more complete, scalable, and role-aware. The client onboarding flow also needs to be redesigned because the current system supports only:

- Tax Status: Individual
- Holding Name: Single

The CRM must now support additional holding patterns such as Joint and Anyone or Survivor. The first implementation priority is Individual tax status with Single, Joint, and Anyone or Survivor holding patterns. The document rules should also be structured to support Minor and NRI onboarding for NSE/BSE, with future versions expanding to HUF, Company, and other tax statuses.

## 3. Product Goals

### Primary Goals

1. Create a complete internal CRM for client and back-office management.
2. Centralize all client data, documents, tasks, and service records.
3. Support role-based access for admin and operations users.
4. Redesign client onboarding to support multiple holding patterns.
5. Store different sets of holder details and documents based on holding pattern.
6. Provide task tracking and team performance visibility.
7. Maintain company credentials securely with admin-only edit access.
8. Notify users about client birthdays and assigned tasks.
9. Provide access to financial calculators from inside the CRM.
10. Include risk profiling analysis for clients.
11. Include or integrate the company's insurance portal.
12. Track insurance ownership and source for every client.

### Success Metrics

- Reduction in manual follow-ups and spreadsheet usage.
- Faster client onboarding.
- Reduced missing-document cases.
- Improved visibility of pending operational tasks.
- Admin can monitor team performance from one place.
- Operations team receives timely task and birthday notifications.
- Client profiles become complete, searchable, and audit-friendly.

## 4. User Roles and Permissions

## 4.1 Admin

Admin will have full access to the CRM.

### Admin Capabilities

- Add, edit, archive, and delete clients, subject to audit rules.
- Upload, replace, verify, and delete client documents.
- View and edit parsed client information.
- Assign tasks to operations users.
- Reassign tasks.
- Change task priority, due date, and status.
- View all tasks across all users.
- View task performance reports.
- Add and manage operations users.
- Manage role permissions.
- Edit company details and credentials.
- View birthday calendar and birthday notifications.
- View and use calculators.
- Add calculator links or embedded calculators.
- View and manage risk profiling records.
- View and manage insurance details.
- Access all client files and operational records.
- View activity logs and audit history.

## 4.2 Operations

Operations users will have restricted access based on the company's workflow.

### Operations Capabilities

- View assigned tasks.
- Update task status.
- Add task comments and completion notes.
- View clients assigned to them or visible to operations.
- Add or upload client documents if permitted.
- View parsed information where permission is granted.
- View birthday calendar and birthday notifications.
- View calculators.
- Fill or update risk profiling forms if permitted.
- Update insurance information if permitted.

### Operations Restrictions

- Cannot edit company credentials.
- Cannot delete clients.
- Cannot manage users or permissions.
- Cannot access admin-only reports unless explicitly permitted.
- Cannot edit system-level settings.
- Cannot permanently delete documents.
- Cannot override verified client data without admin approval.

## 5. Product Scope

## 5.1 In Scope

- Login and role-based access.
- Admin dashboard.
- Operations dashboard.
- Client management.
- Client onboarding with holding-pattern-based fields.
- Document upload and storage.
- Document parsing and extracted data review.
- Task assignment and task tracking.
- Notifications for tasks and birthdays.
- Company details and credentials page.
- Birthday calendar.
- Calculator page.
- Risk profiling analysis page.
- Insurance portal section or integration.
- Insurance-related fields in client profile.
- Activity logs and audit trail.
- Search, filters, and client profile views.

## 5.2 Out of Scope for Current Phase

The following can be planned for later phases:

- Full workflow support for HUF, Company, Trust, LLP, and other tax statuses.
- Advanced Minor and NRI workflows beyond the NSE/BSE document checklist defined in this PRD.
- Direct API integration with AMCs, RTA portals, NSE, BSE, CAMS, KFin, or insurers, unless already available.
- Full transaction execution inside CRM.
- Client-facing mobile app.
- Client login portal.
- Automated regulatory compliance validation.
- E-signature integration.
- WhatsApp or SMS automation, unless selected as a separate integration.

## 6. Core Modules

## 6.1 Authentication and Role-Based Access Control

### Objective
Allow secure login and ensure each user can access only the features allowed for their role.

### Functional Requirements

- Users must log in using email/username and password.
- System must support at least two roles:
  - Admin
  - Operations
- Admin must be able to create and deactivate operations users.
- Admin must be able to reset user passwords.
- Admin must be able to control permissions for sensitive modules.
- System must maintain login history.
- System must log important actions such as client edits, document uploads, credential updates, and task changes.

### Acceptance Criteria

- Admin can access all pages.
- Operations user cannot access admin-only pages.
- Unauthorized route access must show an access denied message or redirect safely.
- All sensitive actions must be recorded in the audit log.

## 6.2 Dashboard

### Objective
Provide each user with a quick view of relevant work, alerts, and business activity.

### Admin Dashboard

Admin dashboard should show:

- Total clients.
- New clients added this month.
- Pending document verification count.
- Pending tasks.
- Overdue tasks.
- Tasks by status.
- Operations team performance summary.
- Today's birthdays.
- Upcoming birthdays.
- Risk profiling pending cases.
- Insurance follow-up cases.
- Recently updated clients.

### Operations Dashboard

Operations dashboard should show:

- Assigned tasks.
- Overdue tasks.
- Tasks due today.
- Recently assigned tasks.
- Today's birthdays.
- Upcoming birthdays.
- Clients requiring document action.
- Notifications.

### Acceptance Criteria

- Admin and operations dashboards must show different data based on permissions.
- Clicking any dashboard card should open the filtered relevant page.
- Dashboard data should update when tasks or client records are changed.

## 6.3 Client Management

### Objective
Create a complete and searchable client profile that stores personal details, holder information, documents, extracted data, insurance status, and operational history.

### Client Profile Sections

Each client profile should contain:

- Basic client information.
- Tax status.
- Holding pattern.
- Holder details.
- Contact details.
- Address details.
- Bank details.
- Nominee details.
- Investment product interests.
- Mutual fund details.
- PMS/AIF details.
- GIFT City details.
- Insurance details.
- Risk profile.
- Documents.
- Parsed document information.
- Tasks linked to the client.
- Notes and follow-ups.
- Activity history.

## 6.4 Client Onboarding Flow

### Objective
Redesign client onboarding to first ask Tax Status, then Holding Pattern, and then dynamically collect holder-specific details and documents.

### Current Limitation
The system currently supports only:

- Tax Status: Individual
- Holding Name: Single

### Required New Flow

Step 1: Select Tax Status

- Current phase priority: Individual.
- Document checklist rules should also be defined for Minor and NRI so the CRM architecture can support them without redesign.
- Future phase options:
  - Minor
  - NRI
  - HUF
  - Company
  - Partnership
  - LLP
  - Trust
  - Others

Step 2: Select Holding Pattern

For Tax Status Individual, supported holding patterns in current phase:

- Single
- Joint
- Anyone or Survivor

Step 3: Show Dynamic Form

The CRM must show different holder fields and document requirements based on selected holding pattern.

Step 4: Upload Documents

The CRM must display holder-wise required documents and allow upload against each holder.

Step 5: Parse Documents

The CRM should parse available details from uploaded documents and allow review before saving.

Step 6: Review and Submit

The user should review all client, holder, and document details before saving the profile.

### Acceptance Criteria

- Tax Status must be selected before Holding Pattern.
- For now, only Individual should be active.
- Future tax statuses should be visible only if enabled by admin or development configuration.
- Holding Pattern must determine required fields and documents.
- A client cannot be marked complete until mandatory fields and documents are uploaded or marked as exception by admin.
- All uploaded documents must be linked to the correct holder.

## 7. Client Data Requirements

## 7.1 Common Client-Level Fields

These fields apply to the overall client profile:

- Client ID
- Client display name
- Tax status
- Holding pattern
- Client category
- Client source
- Relationship manager, if applicable
- Operations owner
- Mobile number
- Alternate mobile number
- Email ID
- Alternate email ID
- Residential address
- Correspondence address
- City
- State
- Country
- PIN code
- Occupation
- Annual income range
- Investment objective
- Risk category
- Appraisal/Bonus date
- Insurance available: Yes/No
- Insurance through company: Yes/No/Not Applicable
- Insurance provider name
- Insurance policy type
- Insurance renewal date
- Insurance remarks
- Notes
- Created by
- Created date
- Last updated by
- Last updated date

## 7.2 Holder-Level Fields

Each holder should have a separate holder profile.

### Holder Fields

- Holder type:
  - Primary holder
  - Second holder
  - Third holder
- Full name
- Father/spouse name
- Date of birth
- Gender
- PAN
- Aadhaar last four digits, where applicable
- CKYC number, if available
- KYC status
- Mobile number
- Email ID
- Address
- Occupation
- Annual income range
- Political exposure status
- FATCA/CRS declaration details
- Signature specimen
- Document verification status
- Holder remarks

## 7.3 Bank Details

Bank details should be stored at client/account level. For NSE/BSE onboarding, cancelled cheque or bank proof must also be collected holder-wise wherever the selected tax status or holding pattern requires it.

### Fields

- Bank name
- Branch
- Account holder name
- Account number
- Account type
- IFSC code
- MICR code
- Cancelled cheque uploaded: Yes/No
- Bank verification status
- Primary bank: Yes/No

## 7.4 Nominee Details

The CRM should support up to three nominees per client onboarding record.

### Fields

- Nominee name
- Nominee relationship
- Nominee date of birth
- Nominee guardian name, if nominee is minor
- Nominee percentage
- Nominee contact details
- Nominee address
- Nomination opted: Yes/No
- Nomination opted out reason, if applicable

## 8. NSE/BSE Onboarding Document Requirements

### Objective
Define exact documents and data points required for NSE/BSE onboarding based on tax status and holding pattern. The CRM must use these rules to dynamically show required upload slots and missing-document status.

### General Rules

- The CRM must first ask Tax Status.
- The CRM must then ask Holding Pattern where applicable.
- Required documents must be generated dynamically from the selected Tax Status and Holding Pattern.
- Nominees are allowed up to a maximum of three.
- Nominee details and documents must be stored nominee-wise.
- Holder documents must be stored holder-wise.
- Passport-size photo and signature must be mandatory for the relevant holder or holders as mentioned below.
- Email ID and phone number should be treated as mandatory onboarding data points, even if they are not uploaded as document files.
- Cancelled cheque should be treated as a mandatory bank proof document wherever listed.

## 8.1 Tax Status: Individual, Holding Pattern: Single

### Description
Only one holder is present. The client account is operated by the single individual holder.

### Required Holder Details

- Primary holder details.
- Primary holder contact details.
- Primary holder KYC details.
- Bank details.
- Nominee details, maximum three nominees.

### Required Holder Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Additional Mandatory Holder Documents

- Passport-size photo.
- Signature.

### Nominee Requirements

For each nominee, up to a maximum of three:

- PAN card.
- Aadhaar card.
- Email ID.
- Phone number.

### System Requirements

- The CRM must allow one primary holder only.
- The CRM must allow up to three nominees.
- The CRM must show missing holder documents separately from missing nominee documents.
- The client profile cannot be marked onboarding complete until mandatory holder and nominee requirements are completed or admin approves an exception.

## 8.2 Tax Status: Individual, Holding Pattern: Joint

### Description
More than one holder is present. Transactions or changes may require consent/signatures as per process and product/platform rules.

### Required Holder Details

- Primary holder details.
- Second holder details.
- Third holder details, if applicable.
- Contact details for each holder.
- KYC details for each holder.
- Bank details.
- Nominee details, maximum three nominees.

### First Holder Required Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Second Holder Required Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Third Holder Required Documents and Data

If a third holder is added:

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Additional Mandatory Documents for All Holders

- Passport-size photo.
- Signature.

### Nominee Requirements

For each nominee, up to a maximum of three:

- PAN card.
- Aadhaar card.
- Email ID.
- Phone number.

### System Requirements

- The CRM must allow at least two holders.
- The CRM should optionally allow a third holder.
- Each holder must have independent document upload slots.
- Cancelled cheque must be collected against each holder as per NSE/BSE onboarding requirement.
- The system must show missing documents holder-wise.
- Parsed data must be mapped to the correct holder.
- The CRM must allow up to three nominees.
- The client profile cannot be marked onboarding complete until mandatory holder and nominee requirements are completed or admin approves an exception.

## 8.3 Tax Status: Individual, Holding Pattern: Anyone or Survivor

### Description
Multiple holders are present, but operation rights may allow any one holder or the surviving holder to operate as per applicable platform/product rules and internal process.

### Required Holder Details

- Primary holder details.
- Second holder details.
- Third holder details, if applicable.
- Contact details for each holder.
- KYC details for each holder.
- Operation mode: Anyone or Survivor.
- Bank details.
- Nominee details, maximum three nominees.

### First Holder Required Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Second Holder Required Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Third Holder Required Documents and Data

If a third holder is added:

- PAN card.
- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Additional Mandatory Documents for All Holders

- Passport-size photo.
- Signature.

### Nominee Requirements

For each nominee, up to a maximum of three:

- PAN card.
- Aadhaar card.
- Email ID.
- Phone number.

### System Requirements

- The CRM must allow multiple holders.
- The account operation mode must be stored separately from holder count.
- The CRM must display operation mode clearly in the client profile.
- Document completeness must be checked for every holder.
- Cancelled cheque must be collected against each holder as per NSE/BSE onboarding requirement.
- The CRM must allow up to three nominees.
- The client profile cannot be marked onboarding complete until mandatory holder and nominee requirements are completed or admin approves an exception.

## 8.4 Tax Status: Minor

### Description
Minor onboarding requires minor-level details/documents and guardian details/documents. The CRM must clearly separate minor holder requirements from guardian requirements.

### Minor Required Documents and Data

- Aadhaar card.
- Cancelled cheque.
- Email ID.
- Phone number.

### Guardian Required Documents and Data

- PAN card.
- Aadhaar card.
- Email ID.
- Phone number.

### Additional Mandatory Documents for Holder

- Passport-size photo.
- Signature.

### System Requirements

- The CRM must store the minor and guardian as separate linked entities.
- Guardian details must be mandatory for Minor tax status.
- The CRM must show separate upload sections for Minor and Guardian.
- The client profile cannot be marked onboarding complete until minor, guardian, and additional mandatory requirements are completed or admin approves an exception.

## 8.5 Tax Status: NRI

### Description
NRI onboarding requires domestic identity documents, NRE/NRO bank proof, foreign address details, and passport details.

### Holder Required Documents and Data

- PAN card.
- Aadhaar card.
- Cancelled cheque for NRE/NRO account.
- Email ID.
- Phone number.
- Foreign address.
- Passport.

### Additional Mandatory Holder Documents

- Passport-size photo.
- Signature.

### Nominee Requirements

For each nominee, up to a maximum of three:

- PAN card.
- Aadhaar card.
- Email ID.
- Phone number.

### System Requirements

- The CRM must capture whether the bank account is NRE or NRO.
- Foreign address must be stored separately from Indian correspondence address, if both are available.
- Passport upload must be mandatory for NRI tax status.
- The CRM must allow up to three nominees.
- The client profile cannot be marked onboarding complete until mandatory holder and nominee requirements are completed or admin approves an exception.

## 9. Document Management

### Objective
Store client documents securely, map them to the right holder or client record, and allow document verification.

### Functional Requirements

- Upload documents against client-level or holder-level categories.
- Store file type, upload date, uploaded by, and verification status.
- Allow admin to verify, reject, replace, or mark exception.
- Allow operations to upload documents if permitted.
- Support document preview.
- Support document download based on permission.
- Support parsed data extraction.
- Support document expiry or renewal reminders where applicable.
- Maintain version history when a document is replaced.

### Document Statuses

- Pending upload
- Uploaded
- Parsed
- Under review
- Verified
- Rejected
- Exception approved

### Acceptance Criteria

- Every uploaded document must belong to a client and either a holder or client-level section.
- System must show missing mandatory documents.
- Rejected documents must include rejection reason.
- Replaced documents must remain available in version history for admin.

## 10. Document Parsing

### Objective
Extract useful information from uploaded documents and reduce manual data entry.

### Functional Requirements

- Parse PAN, name, date of birth, and other readable details from PAN card.
- Parse address details from address proof where possible.
- Parse bank name, account number, IFSC, and account holder name from cancelled cheque where possible.
- Show extracted data in a review screen.
- Allow user to accept, edit, or reject extracted fields.
- Save only reviewed data into client profile.
- Maintain source document reference for extracted fields.

### Acceptance Criteria

- Parsed data must not overwrite verified data without confirmation.
- Users must be able to review extracted values before saving.
- If confidence is low, the system must flag the field for manual review.

## 11. Task Tracker and Team Performance Management

### Objective
Allow admin to assign work to operations team members and track status, delays, and performance.

### Functional Requirements

- Admin can create tasks.
- Admin can assign tasks to operations users.
- Admin can link tasks to a client.
- Admin can set priority.
- Admin can set due date.
- Admin can add task description and attachments.
- Operations users receive notification when assigned a task.
- Operations users can update status.
- Operations users can add comments.
- Admin can view all task history.
- Admin can reassign tasks.
- Admin can close or reopen tasks.

### Task Fields

- Task ID
- Task title
- Description
- Client linked
- Assigned to
- Assigned by
- Department
- Priority
- Due date
- Status
- Completion date
- Comments
- Attachments
- Created date
- Last updated date

### Task Statuses

- New
- Assigned
- In progress
- Waiting for client
- Waiting for internal approval
- Completed
- Reopened
- Cancelled

### Performance Metrics

- Total assigned tasks.
- Completed tasks.
- Pending tasks.
- Overdue tasks.
- Average completion time.
- Tasks completed before due date.
- Tasks reopened.
- Department-wise task load.

### Acceptance Criteria

- Assigned user must receive notification.
- Task status changes must be visible to admin.
- Admin dashboard must show overdue and pending task counts.
- Task history must show all status changes with date and user.

## 12. Notifications

### Objective
Notify users about important work and events.

### Notification Types

- New task assigned.
- Task due today.
- Task overdue.
- Task status changed.
- Task comment added.
- Client birthday today.
- Upcoming birthday.
- Document rejected.
- Document verification pending.
- Risk profile pending.
- Insurance renewal reminder.

### Notification Channels

Current phase:

- In-app notifications.
- Dashboard alerts.

Future phase:

- Email.
- SMS.
- WhatsApp.

### Acceptance Criteria

- Notifications must be role-aware.
- Admin should receive important operational notifications.
- Operations users should receive notifications relevant to their assigned work.
- Birthday notifications should appear for both admin and operations users.

## 13. Company Details and Credentials Page

### Objective
Maintain company-level details and important portal credentials in one secure admin-managed section.

### Data to Store

- Company name
- ARN
- EUIN details, if applicable
- Registered address
- Contact details
- NSE portal credentials
- BSE portal credentials
- CAMS credentials
- KFin credentials
- Insurance portal details
- GIFT City related portal details, if applicable
- Other platform credentials

### Security Requirements

- Only admin can add or edit credentials.
- Operations users should not see passwords unless permission is explicitly granted.
- Password fields must be masked.
- Credential view/copy actions must be logged.
- Credential updates must be logged.
- Sensitive credentials should be encrypted at rest.

### Acceptance Criteria

- Admin can edit company details.
- Admin can update credentials.
- Operations user cannot edit this page.
- Credential changes appear in audit history.

## 14. Birthday Module

### Objective
Show client birthdays in a calendar and notify users of birthdays on the respective day.

### Functional Requirements

- Show monthly calendar.
- Mark dates that have client birthdays.
- On hover over a date, show list of clients with birthdays on that date.
- On click, open detailed birthday list for that date.
- Show today's birthdays on dashboard.
- Send in-app notification for today's birthdays.
- Allow filtering by month, operations owner, relationship manager, or client category.

### Birthday Data Source

- Date of birth from client/holder profile.
- For joint accounts, birthday should be tracked holder-wise.

### Acceptance Criteria

- Users can see all birthdays for a selected date.
- Hovering on a calendar date shows birthday names.
- Admin and operations users receive birthday notifications.
- Joint holder birthdays are not missed.

## 15. Calculator Module

### Objective
Provide one centralized page for financial calculators used by the company.

### Calculator Types

- Reverse Calculation Calculator
- Mutual Fund Calculator
- SIP Calculator
- SWP Calculator
- STP Calculator
- Mutual + Ace Calculator
- Lumpsum Calculator
- Goal Planning Calculator
- Retirement Calculator
- Insurance Need Calculator
- Other calculators as required

### Functional Requirements

- Show a calculator dashboard/list.
- Support embedded calculators where technically possible.
- Support external links for calculators already hosted on other platforms.
- Admin can add, edit, hide, or reorder calculator links.
- Calculator cards should include name, category, description, and launch option.

### Acceptance Criteria

- Users can access all calculators from one page.
- Existing hosted calculators can be linked.
- Admin can manage calculator entries.

## 16. Risk Profiling Analysis

### Objective
Assess and store client risk profiles for investment suitability and advisory support.

### Functional Requirements

- Create risk profiling questionnaire.
- Assign questionnaire to a client.
- Capture answers.
- Calculate score.
- Map score to risk category.
- Store date of assessment.
- Store risk profile validity or review date.
- Allow admin to review and approve.
- Link risk profile to client profile.

### Risk Categories

Example categories:

- Conservative
- Moderately Conservative
- Balanced
- Growth
- Aggressive

### Acceptance Criteria

- Every client can have a risk profile record.
- System calculates risk category based on scoring rules.
- Admin can review and approve risk analysis.
- Risk profile history is preserved.

## 17. Insurance Module or Portal Integration

### Objective
Include the company's separate insurance portal within the CRM experience or connect users to it from the CRM.

### Functional Requirements

- Add Insurance section in CRM.
- Provide link or embedded access to separate insurance portal.
- Store insurance status at client level.
- Track whether the client has insurance.
- Track whether insurance is through the company or someone else.
- Track policy type, insurer, premium, renewal date, and remarks.
- Show upcoming insurance renewals.
- Allow insurance-related tasks and follow-ups.

### Client Insurance Fields

- Has insurance: Yes/No/Unknown
- Insurance through company: Yes/No/Not Applicable
- Policy type
- Insurance company
- Policy number
- Premium amount
- Premium frequency
- Renewal date
- Sum assured
- Nominee
- Insurance remarks
- Insurance document upload

### Acceptance Criteria

- Each client profile shows insurance status.
- Users can identify clients with insurance through the company.
- Users can identify clients with external insurance.
- Renewal reminders can be created from insurance dates.

## 18. PMS, AIF, and GIFT City Sections

### Objective
Allow the CRM to store product-specific information beyond mutual funds.

### PMS/AIF Fields

- Product interest: PMS/AIF/Both
- Provider name
- Strategy/category
- Commitment amount
- Investment date
- Application status
- Documents submitted
- Follow-up owner
- Remarks

### GIFT City Fields

- GIFT City interest: Yes/No
- Product type
- Provider/platform
- Investment amount
- Currency
- Tax/residency notes
- Documents required
- Application status
- Remarks

### Acceptance Criteria

- Client profile can show product interests and status.
- Product-specific records can be linked to tasks and documents.

## 19. Search and Filters

### Objective
Allow users to quickly find clients, tasks, documents, and records.

### Search Requirements

- Search clients by name, PAN, mobile number, email, client ID.
- Search tasks by title, assignee, status, due date, client.
- Filter clients by holding pattern.
- Filter clients by insurance status.
- Filter clients by birthday month.
- Filter clients by missing documents.
- Filter clients by risk profile status.
- Filter tasks by overdue, priority, assignee, and status.

### Acceptance Criteria

- Search should return relevant results quickly.
- Filters should be combinable.
- Users should only see results they are permitted to access.

## 20. Reports

### Admin Reports

- Client onboarding report.
- Missing documents report.
- Document verification report.
- Task performance report.
- User performance report.
- Birthday report.
- Insurance report.
- Risk profiling report.
- Product interest report.
- PMS/AIF/GIFT City pipeline report.

### Operations Reports

- My assigned tasks.
- My pending tasks.
- My overdue tasks.
- Client document pending list.
- Birthday list.

### Acceptance Criteria

- Admin can export reports if export is enabled.
- Operations reports are limited to allowed data.
- Reports should support date filters.

## 21. Audit Trail and Compliance-Oriented Controls

### Objective
Maintain traceability of important actions.

### Events to Log

- User login.
- Client created.
- Client edited.
- Client deleted or archived.
- Document uploaded.
- Document verified.
- Document rejected.
- Parsed data accepted or edited.
- Task created.
- Task assigned.
- Task status changed.
- Company credential viewed.
- Company credential updated.
- Risk profile approved.
- Insurance details updated.

### Acceptance Criteria

- Admin can view audit logs.
- Audit logs cannot be edited by normal users.
- Logs must include user, action, timestamp, old value where relevant, and new value where relevant.

## 22. Data Model Overview

### Main Entities

- User
- Role
- Permission
- Client
- Holder
- Guardian
- Address
- Bank Account
- Nominee
- Document
- Parsed Document Data
- Task
- Task Comment
- Notification
- Company Detail
- Company Credential
- Birthday Event
- Calculator
- Risk Profile
- Insurance Policy
- Product Interest
- Audit Log

### Key Relationships

- One client can have multiple holders.
- One Minor client must have one guardian record linked to the client.
- One client can have multiple documents.
- One holder can have multiple holder-specific documents.
- One nominee can have nominee-specific documents and contact details.
- One client can have multiple tasks.
- One task can have multiple comments.
- One client can have one or more insurance records.
- One client can have multiple risk profile history records.
- One user can be assigned many tasks.
- One admin can create many tasks.

## 23. Suggested Navigation

### Admin Navigation

- Dashboard
- Clients
- Add Client
- Tasks
- Team Performance
- Documents
- Birthdays
- Calculators
- Risk Profiling
- Insurance
- PMS/AIF
- GIFT City
- Company Details
- Users and Roles
- Reports
- Audit Logs
- Settings

### Operations Navigation

- Dashboard
- Clients
- My Tasks
- Documents
- Birthdays
- Calculators
- Risk Profiling
- Insurance
- Reports
- Notifications

## 24. Non-Functional Requirements

### Security

- Passwords must be hashed.
- Sensitive credentials must be encrypted.
- Role-based access must be enforced on both frontend and backend.
- Documents must not be publicly accessible.
- Every sensitive action must be logged.

### Performance

- Client search should be fast for large client databases.
- Dashboard should load summary data efficiently.
- File uploads should show progress and clear success/failure states.

### Reliability

- Uploaded documents should not be lost.
- Failed uploads should show retry option.
- Task and document status updates should be saved reliably.

### Usability

- Forms should be step-wise and easy for operations users.
- Required fields should be clearly marked.
- Missing documents should be visible holder-wise.
- Admin should be able to review all incomplete client profiles.

### Scalability

- The system should support future tax statuses.
- The system should support future product modules.
- The system should support additional roles in future.

## 25. MVP Scope Recommendation

### MVP Phase 1

- Login and role-based access.
- Admin and operations dashboards.
- Client onboarding redesigned for Individual tax status.
- Holding patterns:
  - Single
  - Joint
  - Anyone or Survivor
- NSE/BSE document checklist rules for:
  - Individual Single
  - Individual Joint
  - Individual Anyone or Survivor
  - Minor
  - NRI
- Holder-wise document upload.
- Nominee-wise document and contact detail capture, maximum three nominees.
- Guardian-wise document and contact detail capture for Minor onboarding.
- Client profile with new fields.
- Basic document parsing review.
- Task assignment and status tracking.
- In-app task notifications.
- Birthday calendar and notifications.
- Company details and credentials page with admin-only edit access.
- Calculator links page.

### Phase 2

- Risk profiling analysis.
- Insurance module and renewal reminders.
- Reports and exports.
- Team performance dashboard.
- Advanced document verification.
- PMS/AIF/GIFT City pipeline sections.

### Phase 3

- Additional tax statuses such as HUF, Company, Trust, LLP, and others.
- Email/SMS/WhatsApp notifications.
- Portal/API integrations.
- E-signature support.
- Advanced analytics.
- Client-facing portal, if required.

## 26. User Stories

### Admin User Stories

- As an admin, I want to add a new client so that all client information is stored in one place.
- As an admin, I want to choose tax status and holding pattern so that the correct holder details and documents are collected.
- As an admin, I want to upload documents holder-wise so that documents are mapped correctly.
- As an admin, I want to assign tasks to operations users so that work is tracked.
- As an admin, I want to view overdue tasks so that I can follow up with the team.
- As an admin, I want to edit company credentials so that important portal information stays updated.
- As an admin, I want to view team performance so that I can monitor productivity.
- As an admin, I want to view client birthdays so that relationship actions can be planned.

### Operations User Stories

- As an operations user, I want to see my assigned tasks so that I know what work to complete.
- As an operations user, I want to update task status so that admin knows the progress.
- As an operations user, I want to upload missing documents so that client profiles can be completed.
- As an operations user, I want to see birthday notifications so that I can coordinate client greetings.
- As an operations user, I want to access calculators so that I can support client-related work.
- As an operations user, I want to see client insurance status so that I can manage follow-ups.

## 27. Key Acceptance Criteria Summary

- The CRM must support admin and operations roles.
- Admin must have full control.
- Operations must have restricted access.
- Tax Status must be selected before Holding Pattern.
- Current phase must support Individual tax status.
- Individual tax status must support Single, Joint, and Anyone or Survivor holding patterns.
- NSE/BSE document rules must be configured for Individual Single, Individual Joint, Individual Anyone or Survivor, Minor, and NRI.
- Each tax status and holding pattern must show different required fields and documents.
- Joint and Anyone or Survivor clients must support multiple holders.
- Minor onboarding must separately capture minor and guardian requirements.
- NRI onboarding must capture NRE/NRO cancelled cheque, foreign address, and passport.
- Nominee capture must allow a maximum of three nominees.
- Passport-size photo and signature must be mandatory for holders wherever specified in the onboarding checklist.
- Documents must be uploaded holder-wise where applicable.
- Document parsing must allow review before saving extracted data.
- Task assignment must trigger notification.
- Operations must be able to update task status.
- Birthday calendar must show holder-wise birthdays.
- Company credentials must be editable only by admin.
- Calculators must be accessible from a centralized page.
- Risk profiling and insurance modules must be supported.
- All important actions must be logged.

## 28. Open Questions

1. Should operations users be able to add new clients, or only admin?
2. Should operations users be able to edit existing client details?
3. Should operations users be able to view company credentials in masked form, or not at all?
4. Should birthday notifications be sent only in-app or also by email/WhatsApp later?
5. Should the insurance portal be embedded inside the CRM or opened as a separate linked portal?
6. Which calculators are already hosted, and what are their URLs?
7. Should document parsing use OCR, AI extraction, or a fixed template-based parser?
8. Should client documents require admin verification before the client profile is considered complete?
9. Should client deletion be allowed, or should records only be archived?
10. Should the system support branch, department, or relationship-manager-wise access in future?

## 29. Risks and Considerations

- Financial and identity documents are sensitive and must be stored securely.
- Credential storage must be encrypted and access-controlled.
- Document parsing may produce incorrect data and must always include human review.
- Regulatory and platform-specific document requirements may change; the document checklist should be configurable.
- Future tax statuses will require different data and document rules, so the onboarding architecture should be dynamic, not hardcoded.
- Minor and NRI onboarding have special data structures, including guardian information for Minor and foreign address/passport/NRE-NRO bank details for NRI.
- Joint and Anyone or Survivor holding patterns require careful holder-wise data mapping.

## 30. Final Product Vision

The CRM should become the company's central operational command center. Admin should be able to control clients, team work, credentials, reports, and internal processes from one place. Operations users should have a focused workspace where they can see assigned work, complete tasks, upload documents, update statuses, and support client servicing efficiently.

The most important foundation is a flexible client onboarding system. Instead of treating every client as a single individual holder, the CRM must support a structured model where tax status, holding pattern, holders, nominees, guardians, documents, and verification rules are all connected. This will make the product ready for Individual, Minor, NRI, HUF, Company, and other client types.
