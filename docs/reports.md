# CRM reports and management dashboard

Create these using CRM's Reports and Analytics UI after the modules, permissions and workflow associations exist. The repository does not claim these account-specific report objects have been created remotely.

| Report | Base / related modules | Filter and grouping | Management question |
|---|---|---|---|
| Admission pipeline | Leads | Group by Admission_Status; count; filter desired section/year | How many enquiries reach confirmation? |
| Follow-ups due | Leads | Follow_Up_Date ≤ today; exclude Confirmed and Rejected | Which families need a response? |
| Active enrollment register | Enrollments → Students, Sections, Academic_Years | Status = Active; group year/class/section | Who is enrolled where? |
| Academic history | Students → Enrollments | Group by student, academic year | Where was this student in previous years? |
| Daily attendance register | Attendance → Enrollments → Students | Filter date/year/section; group Status | Who was absent on a particular day? |
| Student attendance percentage | Enrollments → Students | Display Recorded_Days, Present_Days, Attendance_Percentage; Recorded_Days > 0 | Which students have low attendance? |
| Subject marks ledger | Results → Exam_Papers → Exams/Subjects; Enrollments → Students | Group exam, section, subject; average Percentage | How are subjects and classes performing? |
| Students below pass mark | Results | Grade = F; group exam/section | Who needs academic support? |
| Fee collection | Fee_Assessments → Enrollments/Students | Sum Amount, Amount_Collected, Outstanding, Credit; group year/section | What is collected and still owed? |
| Outstanding fees | Fee_Assessments → Enrollments/Students | Outstanding > 0; sort Due_Date ascending | Which balances need follow-up? |
| Installment history | Payments → Fee_Assessments | Group student/assessment; display date, amount, method, reference | What was paid, and when? |
| Early support | School_Followups → Enrollments/Students | Status = Open; group Kind | Which students need attention today? |

For **class-level performance**, use subject percentages when comparing the same paper. For an overall class score across differently weighted papers, calculate `sum(Marks) / sum(Max_Marks) × 100` in a joined report if the edition permits the required formula, or export the results with paper maxima. Do not average percentages with different denominators and label that a weighted score. The companion's student summary implements the weighted calculation.

Dashboard tiles: active enrollments, open enquiries, confirmed admissions, average student attendance (clearly labeled) or overall attended/recorded days, total assessed fees, collected fees, outstanding fees, and open support concerns. Add admission pipeline, attendance-by-day, results-by-subject, and overdue-fee tables.

An average of per-student attendance percentages is not the same as overall school attendance if students have different denominators. Use `sum(Present_Days) / sum(Recorded_Days)` for the latter. Keep the academic-year filter consistent across all tiles.

Native rollups are updated asynchronously. Label dashboards accordingly and associate the daily reconciliation schedule. The companion/Creator fee views calculate from actual payment records at read time.
