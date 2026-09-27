# Deploy the required Zoho implementation

This is the manual/live-account portion that cannot be executed without your account. The code and offline schema plan are ready; compiling scripts and associating native CRM/Creator components must be done in the target tenant. Keep that distinction in the submission.

## 1. Organization and schema

Initialize CRM and Creator in a Zoho One trial. Set the school timezone to Asia/Kolkata (or match your actual school and `SCHOOL_TIMEZONE`) and use ISO `yyyy-MM-dd` date formatting for the supplied CRM Client Scripts. Confirm the edition supports the custom modules and function-based validation; the [module creation API](https://www.zoho.com/crm/developer/docs/api/v8/create-custom-module-api.html) documents edition requirements.

Follow `credentials.md`, then run `npm run zoho:plan`. Review `.cache/zoho-schema-plan.json`. It contains **16 custom modules plus the existing Leads module**. Set `ZOHO_PROFILE_ID` and run `npm run zoho:provision`. This adds only missing modules/fields. It stops on errors and checks generated API names, allowing a safe rerun after fixing a mismatch. It does not overwrite existing layouts or delete records. API-name collisions must be resolved explicitly in your tenant.

Use `packages/schema/schema.json` as the authoritative field dictionary: `key` is the exact API name, `type` is the input type, `ref` is the lookup target, `options` is the picklist, and `unique` is the duplicate constraint. Fields are created from canonical labels. The script reads metadata after creation to check that CRM used the expected API names. Existing fields still need their type, uniqueness, layout and permissions verified by you.

In **Modules and Fields → Standard layout**, set the listed required fields mandatory. Make `Unique_Key` mandatory on keyed modules and verify its unique constraint. Make `Students.Student_ID`, `Students.Admission_Key`, `Payments.Reference`, and `Subjects.Code` unique as specified. Leave Leads.Email non-unique so siblings can share a parent email.

`Leads.Desired_Section` is intentionally optional during intake and mandatory at **confirmation**. Native Webforms do not expose lookup fields: use the text `Requested_Class` field on the public form, then let Admissions staff select the actual section. The local React form can choose a section through its Go endpoint. This avoids pretending that a lookup field is available in the native Webform designer. See the [CRM Webform field restrictions](https://help.zoho.com/portal/en/kb/crm/faqs/channels/articles/faqs-webforms).

Create reference data in this order: Academic Years, School Classes, Sections, Subjects, Teachers, Teaching Assignments. Add current-year sections separately from next-year sections. Set exam paper pass/maximum marks before recording results.

## 2. Native staff permissions and record integrity

Create school-specific CRM profiles. Suggested assignments:

| Profile       | Access                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Administrator | Academic configuration, parent access links, admission confirmation/promotion, correction supervision             |
| Admissions    | Leads and follow-up dates; read necessary sections/student links; confirm via button                              |
| Teacher       | Assigned students/enrollments, Attendance and Results; read exam papers; no payment or parent-link administration |
| Finance       | Fee assessments and payment creation; read student/enrollment identifiers; no marks or parent-link administration |

Use CRM sharing rules/ownership and field permissions to restrict teacher records. The companion has a single administrator account and is not a substitute for configuring these native staff roles.

- Expose `Name` and required inputs on native forms. Protect identity, relationships, unique keys and derived totals after creation. Do not change an enrollment's student/year/section to represent promotion.
- Disable ordinary edit/delete on Payments. Keep fee amounts and historical relationships immutable once issued. Corrections/refunds need a separately designed audited administrative procedure; this assignment does not claim one.
- Parent_Links is administrator-only. Verify the parent identity before activating a link. Inviting an email without a matching active link reveals no child.
- Students should normally be created by the admission button, which generates `Student_ID = STU-<Lead ID>`. Do not expose a manual native student-create path with a blank ID. The companion's direct student-create endpoint also generates a unique ID.
- Keep calculated result, attendance and fee fields read-only for ordinary staff.
- Unique keys must be populated before save, not by an after-save workflow. Restrict imports, alternate/mobile layouts and third-party write clients unless they supply validated keys. CRM uniqueness is the concurrency barrier; Client Scripts by themselves are not authorization.

## 3. Functions, validation and Client Scripts

Create each function in the category named in its source file. When CRM generates a function wrapper, retain that wrapper and paste the body inside it, matching the declared arguments/return type. Files in `validation/` are already **bodies** that expect CRM's `crmAPIRequest`; do not paste them as workflow functions. Save/compile in CRM, resolve tenant API names if needed, and run the acceptance tests before marking this deployment ready.

| Function                            | Context / association                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `button.confirm_admission`          | Leads detail-page button, `lead_id` mapped to Lead ID                            |
| `button.promote_student`            | Enrollments detail-page button; map current ID and a next-section lookup ID      |
| `automation.calculate_result`       | Results create and Marks edit; `result_id` = Result ID                           |
| `automation.recalculate_attendance` | Attendance create and Status edit; `enrollment_id` = Enrollment lookup ID        |
| `automation.recalculate_fee`        | Fee assessment create and Payments create; `fee_id` = the relevant assessment ID |
| `standalone.review_support`         | Called by support review hooks or reconciliation; enrollment ID argument         |
| `schedule.reconcile_school`         | Daily schedule, e.g. 18:00 school timezone; recomputes rollups and support queue |

For the native promotion button, add an optional `Next_Section` lookup to Sections on the Enrollment layout and map its ID into `next_section_id`. This selection field is only a button input; it does not replace the current section. Allow staff to choose it even when historical enrollment relationships are read-only. Compile supporting functions before the schedule that calls them.

Associate function-based **Save Only** validation rules:

| Module      | Field to attach | Validation source              | onSave Client Script             |
| ----------- | --------------- | ------------------------------ | -------------------------------- |
| Attendance  | Unique_Key      | `validation/attendance.deluge` | `attendance_on_save.js`          |
| Results     | Unique_Key      | `validation/result.deluge`     | `result_on_save.js`              |
| Payments    | Amount          | `validation/payment.deluge`    | none; mandatory unique Reference |
| Exam_Papers | Unique_Key      | `validation/exam_paper.deluge` | `exam_paper_on_save.js`          |
| Enrollments | Unique_Key      | `validation/enrollment.deluge` | `enrollment_on_save.js`          |

Also attach the provided key scripts to Sections, Parent_Links and Teaching_Assignments. Install scripts on both Create and Edit pages for every permitted layout. For native enrollment entry, display the Academic_Year lookup: staff select it, the Client Script creates the key, and the validation checks it matches the chosen section. The Go API derives that field automatically.

Use native field/criteria validation for these straightforward constraints: academic year End_Date > Start_Date; Grade integer 0–12; DOB < today; positive fee amount; exam date within its section year. Do not allow staff to set Confirmed directly without running the confirmation button. Use controlled transitions/layout permissions and test APIs separately; the Go API performs its own validation.

The grade/rollup functions are after-save calculations; they are not a replacement for the pre-save validation rules. CRM automation can fail independently of the original write, so monitor function logs and enable reconciliation. Do not assume a workflow will trigger another workflow implicitly. If you add a support hook, explicitly invoke `standalone.review_support(enrollment_id)` after the relevant action; the supplied daily schedule also refreshes the queue.

## 4. The required CRM Webform

In CRM **Setup → Channels → Webforms**, create a Leads form. Include child name (`Last_Name`), parent name, email, phone, DOB, `Requested_Class`, and optional notes. Hide/default `Admission_Status=New`; do not expose a Confirmed option, Student lookup, or internal unique keys. Set the admissions owner/assignment rule, school website location URL, success URL, and CAPTCHA/spam controls. Do not enable emails until their content and recipients are approved by you.

Generate Zoho's native HTML/embed/iframe code. Publish it on a page you control. If using the generated iframe, copy only its `src` URL to `ZOHO_WEBFORM_EMBED_URL` in `.env`; the companion's `/#apply` page will display it in live mode. Otherwise use the generated native form page separately and provide its URL for submission. Zoho's generated hidden form identifiers are form configuration, not OAuth secrets; do not substitute your client secret or refresh token into the public HTML. [Native form setup](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/set-up-web-forms).

Test in a private browser window: a submission must create a Lead in the right organization. Select a real `Desired_Section` as staff before confirming admission. Complete a follow-up and confirmation from CRM.

## 5. Private Creator parent portal

Create a blank Creator application, e.g. **School Parent Portal**. Configure a **private/invite-only customer portal**. Do not publish its pages or CRM-backed reports publicly.

1. Create the authorized app-owner connection `school_crm` as explained in `credentials.md`.
2. Add Creator custom functions from `zoho/creator/functions/`: `crm_search` (Map), `escape_html` (String), and `parent_snapshot` (Map), with exactly the arguments in each file. These are internal functions; do not expose `crm_search` through a public/custom API.
3. Create a page with link name **Parent_Portal**. Add Text page parameters `student_id` and `enrollment_id`, each defaulting to empty. Page parameters are untrusted; the snapshot function verifies both against the authenticated parent.
4. Add an HTML snippet and paste `zoho/creator/pages/parent_portal.html` into its source editor. The page uses Deluge server-side rendering, so no OAuth token is embedded in the output. No school-data forms or copied CRM tables are needed.
5. Define a portal permission set that can access only Parent_Portal and approved navigation. Do not grant access to internal forms/reports, connections, record editing, app settings, or unrestricted custom APIs.
6. Add a verified active Parent_Link in CRM. Invite that matching email to the portal. Do not send every parent a shared admin account or let visitors type an arbitrary email to select a child.
7. Test with two invited portal users, siblings, a revoked link and forged URL IDs. Test as a portal user, not only as the Creator app owner.

Creator's exact authoring UI and portal entitlements can vary by account edition. The deployment is not complete until these functions compile and the portal permission tests pass in your tenant. [Page scripts and variables](https://help.zoho.com/portal/en/kb/creator/developer-guide/pages/page-script-and-variables/articles/page-scripts-and-variable), [session identity](https://www.zoho.com/deluge/help/zoho-variables.html).

## 6. Reports, support queue and final checks

Create the CRM reports and dashboard in `reports.md`. In School_Followups create an **Open concerns** view with Status = Open, grouping Kind and showing Enrollment, Details and Owner. The schedule keeps one concern per key and resolves it when the reason clears. No extra database or messaging provider is required.

Run `acceptance.md` in the local app and in Zoho. Configure batch schedules instead of the sample bounded reconciliation if the organization grows beyond the documented window/API execution allowance. Record the actual CRM organization URL, Creator portal URL and native Webform URL for submission. Never mark the assignment remotely deployed just because the local demo passes.
