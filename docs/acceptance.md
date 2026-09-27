# Requirement traceability and acceptance

## Current delivery status

Local source and runnable companion app: implemented. Automated checks: 15 Go tests, 5 frontend tests, Go vet and frontend build passed. Live Zoho provisioning, native Deluge compilation, native permissions, generated CRM Webform, and real CRM/Creator access: **not performed without the user's Zoho account**. No assignment submission email has been sent.

| Assignment requirement      | Implementation                                                                  | Live-account completion                                                |
| --------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CRM Webform → Lead          | Local enquiry form writes Leads through the Go adapter                          | Generate and publish the native CRM Webform                            |
| Admissions                  | Leads pipeline, follow-up date, confirmation button, idempotent record creation | Attach CRM button and enforce status/layout permissions                |
| Unique students and history | Students + annual Enrollments; promotion                                        | Configure native permissions and promotion button                      |
| Academic structure          | Years, classes, sections, subjects, teachers, teaching assignments              | Provision schema and enter the school's reference data                 |
| Attendance                  | Date validation, unique composite key, percent, history                         | Attach Client Script, validation and rollup workflow                   |
| Examinations                | Exams, papers, per-student results, grade/percentage                            | Attach validation, Client Script, calculation workflow                 |
| Fees/installments           | Immutable payment ledger, balances, overdue/credit                              | Configure finance permissions and rollup workflows                     |
| Private parent application  | Creator functions and complete private HTML/Deluge page; demo previews          | Create Creator portal, connection, invitations and private permissions |
| CRM as source of truth      | Live adapter and Creator read-time CRM lookup                                   | Connect real OAuth credentials and verify changes appear               |
| Deluge automation           | Admission, promotion, grade, attendance, fees, support and reconciliation       | Compile and associate functions in tenant                              |
| Reports/dashboards          | Local dashboard/exports; native report definitions                              | Create CRM reports and dashboard objects                               |
| Additional feature          | Early support for low attendance and overdue fees                               | Attach/schedule native School_Followups review                         |

## Local demonstration

1. Start the app and select Staff workspace. Review overview metrics, attendance pulse, students and follow-ups.
2. Open the admission form in another tab. Submit a valid enquiry with a child, parent email, DOB and requested section. It appears as New in Admissions.
3. Change it to Contacted; set a follow-up date. Confirm it. Verify exactly one student, one annual enrollment and one parent link. Repeat confirmation through the API: it must return the same student.
4. Record today's attendance. Attempt a second record for the same enrollment/date: reject it. Attempt a future date: reject it. Correct the existing status and check recalculation.
5. Enter marks of zero and verify F. Enter marks above maximum and verify rejection. Attempt another section's paper and verify rejection.
6. Record two installments against a fee assessment. Verify balance and receipt history. Try a duplicate transaction reference, zero, negative, and a three-decimal amount: reject each. An overpayment is shown as credit, never a negative outstanding amount.
7. Open a student and promote them to a next-year section. Verify prior attendance, results and fees stay under the previous year; retry promotion to ensure no duplicate enrollment.
8. Sign out, then sign in as Sharma parent. Only Aarav and Diya appear. Sign out and choose Patel parent: only Ishaan appears. Parent views provide no mutation controls.
9. Revoke a parent link as staff under Academics → Parent links. Refresh that parent's session: the child disappears. Restore the link for later demonstrations.
10. Verify low-attendance and overdue-fee flags clear when the supporting records change. CSV export should reflect the current filters and protect formula-like values.
11. Check keyboard navigation, dialog focus/Escape, mobile widths around 390px, long names, empty tables, API outages and field validation. Browser visual inspection remains a local follow-up because no browser automation surface was available here.

## Native Zoho checks before submission

- Compile every Deluge function in the target product/context. Validation files are bodies, not standalone Creator functions. Use the exact API names and associations from the deployment guide.
- Test native CRM create and edit pages as Admissions, Teacher, Finance and Administrator profiles. Verify uniqueness is enforced by CRM, including concurrent creates; restrict unvalidated import/alternate-layout paths.
- Test the actual generated CRM Webform outside a signed-in CRM session and ensure a Lead is created. The local React form alone is not evidence of the required native Webform.
- Use two real invited Creator **portal users**, not just the app administrator. Verify each sees only linked children. Change the URL child ID and enrollment ID to another family's IDs: no records must be returned.
- Revoke a Parent_Link and verify immediate denial on refresh. Disable public access to pages, reports and helper/custom APIs.
- Change marks, attendance, class history and payment records in CRM. Refresh Creator and verify current data and calculations. Check a student with no attendance/fees/results.
- Interrupt admission between stages and rerun. Verify CRM unique fields prevent duplicates. Check promotion after a partial failure.
- Run the daily support/reconciliation schedule. Verify stable follow-up keys prevent duplicate concerns and resolved concerns leave the Open view.
- Verify pagination with more than 200 attendance rows for a student and multiple installments. Monitor errors/API limits; never accept truncated financial totals.

## Submission package

Provide your reviewer controlled access to the actual CRM organization, the Creator portal URL with a test parent invitation, and the public CRM Webform URL. Include the short data-model explanation, integration explanation and additional-feature explanation from `docs/architecture.md`. Record a short walkthrough of the checklist above. Share source without `.env`, real school records, session cookies or OAuth tokens. Send to the assignment address only when you decide the live deployment is ready.
