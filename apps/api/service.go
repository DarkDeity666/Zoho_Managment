package main

import (
	"context"
	"fmt"
	"math"
	"net/mail"
	"strings"
	"sync"
	"time"
)

type Service struct {
	Store  Store
	Config Config
	mu     sync.Mutex
}

func (s *Service) today() string { return time.Now().In(s.Config.Location).Format("2006-01-02") }
func (s *Service) dataset(ctx context.Context) (Dataset, error) {
	d := Dataset{}
	for _, m := range modules {
		rows, err := s.Store.List(ctx, m.Key)
		if err != nil {
			return nil, err
		}
		d[m.Key] = rows
	}
	// Read-time summaries keep the companion accurate even if a native workflow
	// is awaiting reconciliation. Persisted CRM summaries remain for CRM reports.
	for _, enrollment := range d["Enrollments"] {
		counted, present := 0, 0
		for _, day := range d["Attendance"] {
			if str(day, "Enrollment") != str(enrollment, "id") || str(day, "Status") == "Excused" {
				continue
			}
			counted++
			if str(day, "Status") == "Present" || str(day, "Status") == "Late" {
				present++
			}
		}
		enrollment["Recorded_Days"] = counted
		enrollment["Present_Days"] = present
		enrollment["Attendance_Percentage"] = nil
		if counted > 0 {
			enrollment["Attendance_Percentage"] = math.Round(float64(present)/float64(counted)*10000) / 100
		}
	}
	collected := map[string]int64{}
	for _, payment := range d["Payments"] {
		collected[str(payment, "Fee_Assessment")] += cents(num(payment, "Amount"))
	}
	for _, fee := range d["Fee_Assessments"] {
		paid := collected[str(fee, "id")]
		balance := cents(num(fee, "Amount")) - paid
		fee["Amount_Collected"] = float64(paid) / 100
		fee["Outstanding"] = float64(max(int64(0), balance)) / 100
		fee["Credit"] = float64(max(int64(0), -balance)) / 100
		status := "Unpaid"
		if paid > 0 {
			status = "Partial"
		}
		if balance <= 0 {
			status = "Paid"
		} else if str(fee, "Due_Date") < s.today() {
			status = "Overdue"
		}
		fee["Payment_Status"] = status
	}
	return d, nil
}
func (s *Service) related(ctx context.Context, module string, r Record, key string) (Record, error) {
	v := str(r, key)
	if v == "" {
		return nil, fmt.Errorf("%s is required", key)
	}
	found, err := s.Store.Get(ctx, module, v)
	if err != nil {
		return nil, fmt.Errorf("invalid %s reference", key)
	}
	return found, nil
}
func (s *Service) unique(ctx context.Context, module, key, value, except string) error {
	rows, err := s.Store.List(ctx, module)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if strings.EqualFold(str(r, key), value) && str(r, "id") != except {
			return fmt.Errorf("duplicate %s record", module)
		}
	}
	return nil
}
func grade(p float64) string {
	switch {
	case p >= 90:
		return "A+"
	case p >= 80:
		return "A"
	case p >= 70:
		return "B"
	case p >= 60:
		return "C"
	case p >= 40:
		return "D"
	default:
		return "F"
	}
}
func cents(v float64) int64 { return int64(math.Round(v * 100)) }

// The service serializes companion mutations. CRM unique fields provide the final
// cross-client duplicate barrier; multi-record admission is a resumable saga.
func (s *Service) Save(ctx context.Context, module, recordID string, input Record) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save(ctx, module, recordID, input)
}
func (s *Service) save(ctx context.Context, module, recordID string, input Record) (Record, error) {
	spec, ok := moduleByKey[module]
	if !ok {
		return nil, fmt.Errorf("unknown module")
	}
	if module == "School_Followups" {
		return nil, fmt.Errorf("follow-ups are generated from school records")
	}
	r := Record{}
	if recordID != "" {
		old, err := s.Store.Get(ctx, module, recordID)
		if err != nil {
			return nil, err
		}
		r = old
		if module == "Leads" && str(old, "Admission_Status") == "Confirmed" {
			return nil, fmt.Errorf("confirmed admissions are immutable")
		}
	}
	allowedEdits := map[string]string{"Leads": "Last_Name,Parent_Name,Email,Phone,Date_of_Birth,Requested_Class,Desired_Section,Admission_Status,Follow_Up_Date,Notes", "Students": "Name,Status", "Parent_Links": "Status", "Attendance": "Status,Notes", "Results": "Marks"}
	if recordID != "" && allowedEdits[module] == "" {
		return nil, fmt.Errorf("historical records are immutable; create a new record")
	}
	for k, v := range input {
		var field *Field
		for _, f := range spec.Fields {
			if f.Key == k {
				copy := f
				field = &copy
				break
			}
		}
		if field == nil || field.Readonly {
			return nil, fmt.Errorf("field %s cannot be written", k)
		}
		if recordID != "" && !strings.Contains(","+allowedEdits[module]+",", ","+k+",") {
			return nil, fmt.Errorf("%s is immutable", k)
		}
		if text, ok := v.(string); ok {
			v = strings.TrimSpace(text)
		}
		r[k] = v
	}
	if module == "Leads" && str(r, "Admission_Status") == "Confirmed" {
		return nil, fmt.Errorf("use the confirm admission action; confirmed leads are immutable")
	}
	if recordID == "" && str(r, "Name") == "" && module != "Leads" {
		r["Name"] = strings.TrimSuffix(spec.Singular, " Record") + " " + s.today()
	}
	for _, f := range spec.Fields {
		if f.Readonly {
			continue
		}
		v := r[f.Key]
		empty := v == nil || str(r, f.Key) == ""
		if f.Required && empty {
			return nil, fmt.Errorf("%s is required", f.Label)
		}
		if empty {
			continue
		}
		if f.Type != "lookup" && f.Type != "number" && f.Type != "money" {
			if _, ok := v.(string); !ok {
				return nil, fmt.Errorf("%s must be text", f.Label)
			}
		}
		switch f.Type {
		case "lookup":
			if _, err := s.related(ctx, f.Ref, r, f.Key); err != nil {
				return nil, err
			}
		case "number", "money":
			n, ok := v.(float64)
			if !ok || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 1e9 {
				return nil, fmt.Errorf("%s must be a non-negative number below 1 billion", f.Label)
			}
			if f.Type == "money" && (n == 0 || math.Abs(n*100-math.Round(n*100)) > 0.00001) {
				return nil, fmt.Errorf("%s must be positive with at most two decimal places", f.Label)
			}
		case "date":
			if _, err := time.Parse("2006-01-02", str(r, f.Key)); err != nil {
				return nil, fmt.Errorf("%s must be a valid date", f.Label)
			}
		case "picklist":
			found := false
			for _, option := range f.Options {
				if str(r, f.Key) == option {
					found = true
				}
			}
			if !found {
				return nil, fmt.Errorf("invalid %s", f.Label)
			}
		case "email":
			email := strings.ToLower(str(r, f.Key))
			parsed, err := mail.ParseAddress(email)
			if err != nil || parsed.Address != email || strings.ContainsAny(email, "()\\,:") {
				return nil, fmt.Errorf("invalid %s", f.Label)
			}
			r[f.Key] = email
		default:
			limit := 255
			if f.Type == "textarea" {
				limit = 2000
			}
			if len(str(r, f.Key)) > limit {
				return nil, fmt.Errorf("%s is too long", f.Label)
			}
		}
	}
	switch module {
	case "Academic_Years":
		if str(r, "Start_Date") >= str(r, "End_Date") {
			return nil, fmt.Errorf("academic year must end after it starts")
		}
	case "School_Classes":
		if num(r, "Grade") > 12 || math.Trunc(num(r, "Grade")) != num(r, "Grade") {
			return nil, fmt.Errorf("grade must be an integer from 0 to 12")
		}
	case "Sections":
		r["Unique_Key"] = str(r, "Academic_Year") + "-" + str(r, "School_Class") + "-" + strings.ToLower(str(r, "Name"))
	case "Teaching_Assignments":
		r["Unique_Key"] = str(r, "Section") + "-" + str(r, "Subject")
	case "Students", "Leads":
		if str(r, "Date_of_Birth") >= s.today() {
			return nil, fmt.Errorf("date of birth must be in the past")
		}
		if module == "Students" && recordID == "" {
			r["Student_ID"] = "STU-" + strings.ToUpper(id()[:12])
		}
	case "Parent_Links":
		r["Unique_Key"] = str(r, "Student") + "-" + str(r, "Parent_Email")
	case "Enrollments":
		section, _ := s.related(ctx, "Sections", r, "Section")
		year, err := s.Store.Get(ctx, "Academic_Years", str(section, "Academic_Year"))
		if err != nil {
			return nil, err
		}
		if str(r, "Start_Date") < str(year, "Start_Date") || str(r, "Start_Date") > str(year, "End_Date") {
			return nil, fmt.Errorf("enrollment start must be inside the academic year")
		}
		r["Academic_Year"] = str(year, "id")
		r["Unique_Key"] = str(r, "Student") + "-" + str(year, "id")
		rows, err := s.Store.List(ctx, "Enrollments")
		if err != nil {
			return nil, err
		}
		for _, e := range rows {
			if str(e, "Student") == str(r, "Student") && str(e, "Status") == "Active" && str(r, "Status") == "Active" {
				return nil, fmt.Errorf("student already has an active enrollment; use Promote")
			}
		}
	case "Attendance":
		enrollment, _ := s.related(ctx, "Enrollments", r, "Enrollment")
		year, err := s.Store.Get(ctx, "Academic_Years", str(enrollment, "Academic_Year"))
		if err != nil {
			return nil, err
		}
		date := str(r, "Attendance_Date")
		if date > s.today() || date < str(enrollment, "Start_Date") || date > str(year, "End_Date") {
			return nil, fmt.Errorf("attendance date must be within enrollment dates and cannot be in the future")
		}
		r["Unique_Key"] = str(r, "Enrollment") + "-" + date
	case "Exams":
		section, _ := s.related(ctx, "Sections", r, "Section")
		year, err := s.Store.Get(ctx, "Academic_Years", str(section, "Academic_Year"))
		if err != nil {
			return nil, err
		}
		if str(r, "Exam_Date") < str(year, "Start_Date") || str(r, "Exam_Date") > str(year, "End_Date") {
			return nil, fmt.Errorf("exam date must be inside the academic year")
		}
	case "Exam_Papers":
		if num(r, "Max_Marks") <= 0 || num(r, "Pass_Marks") > num(r, "Max_Marks") {
			return nil, fmt.Errorf("maximum marks must be positive; passing marks cannot exceed maximum")
		}
		r["Unique_Key"] = str(r, "Exam") + "-" + str(r, "Subject")
	case "Results":
		paper, _ := s.related(ctx, "Exam_Papers", r, "Exam_Paper")
		exam, err := s.Store.Get(ctx, "Exams", str(paper, "Exam"))
		if err != nil {
			return nil, err
		}
		enrollment, _ := s.related(ctx, "Enrollments", r, "Enrollment")
		if str(enrollment, "Section") != str(exam, "Section") {
			return nil, fmt.Errorf("student enrollment does not belong to the examination section")
		}
		if str(exam, "Exam_Date") < str(enrollment, "Start_Date") || str(exam, "Exam_Date") > s.today() {
			return nil, fmt.Errorf("exam must occur during enrollment and cannot be future-dated when recording results")
		}
		if num(r, "Marks") > num(paper, "Max_Marks") {
			return nil, fmt.Errorf("marks exceed maximum")
		}
		p := math.Round(num(r, "Marks")/num(paper, "Max_Marks")*10000) / 100
		r["Percentage"] = p
		r["Grade"] = grade(p)
		if num(r, "Marks") < num(paper, "Pass_Marks") {
			r["Grade"] = "F"
		}
		r["Unique_Key"] = str(r, "Enrollment") + "-" + str(r, "Exam_Paper")
	case "Payments":
		if str(r, "Payment_Date") > s.today() {
			return nil, fmt.Errorf("payment date cannot be in the future")
		}
		r["Reference"] = strings.ToUpper(str(r, "Reference"))
	}
	for _, f := range spec.Fields {
		if f.Unique && str(r, f.Key) != "" {
			if err := s.unique(ctx, module, f.Key, str(r, f.Key), recordID); err != nil {
				return nil, err
			}
		}
	}
	if recordID == "" {
		return s.Store.Create(ctx, module, r)
	}
	delete(r, "id")
	return s.Store.Update(ctx, module, recordID, r)
}

func (s *Service) Admit(ctx context.Context, leadID string) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	lead, err := s.Store.Get(ctx, "Leads", leadID)
	if err != nil {
		return nil, err
	}
	if str(lead, "Admission_Status") == "Rejected" {
		return nil, fmt.Errorf("rejected admissions must be reopened first")
	}
	if str(lead, "Last_Name") == "" || str(lead, "Parent_Name") == "" {
		return nil, fmt.Errorf("child and parent names are required before confirmation")
	}
	if _, err := time.Parse("2006-01-02", str(lead, "Date_of_Birth")); err != nil || str(lead, "Date_of_Birth") >= s.today() {
		return nil, fmt.Errorf("a valid past date of birth is required before confirmation")
	}
	email := strings.ToLower(strings.TrimSpace(str(lead, "Email")))
	parsed, emailErr := mail.ParseAddress(email)
	if emailErr != nil || parsed.Address != email || strings.ContainsAny(email, "()\\,:") {
		return nil, fmt.Errorf("a valid parent email is required before confirmation")
	}
	lead["Email"] = email
	section, err := s.Store.Get(ctx, "Sections", str(lead, "Desired_Section"))
	if err != nil {
		return nil, fmt.Errorf("select a valid section before confirming")
	}
	year, err := s.Store.Get(ctx, "Academic_Years", str(section, "Academic_Year"))
	if err != nil {
		return nil, err
	}
	if s.today() > str(year, "End_Date") {
		return nil, fmt.Errorf("cannot admit into a completed academic year")
	}
	students, err := s.Store.List(ctx, "Students")
	if err != nil {
		return nil, err
	}
	var student Record
	for _, r := range students {
		if str(r, "Admission_Key") == leadID {
			student = r
		}
	}
	if student == nil {
		student, err = s.Store.Create(ctx, "Students", Record{"Name": str(lead, "Last_Name"), "Student_ID": "STU-" + leadID, "Date_of_Birth": str(lead, "Date_of_Birth"), "Status": "Active", "Admission_Key": leadID})
		if err != nil {
			return nil, err
		}
	}
	studentID := str(student, "id")
	links, err := s.Store.List(ctx, "Parent_Links")
	if err != nil {
		return nil, err
	}
	linkKey := studentID + "-" + strings.ToLower(str(lead, "Email"))
	if len(matching(links, "Unique_Key", linkKey)) == 0 {
		_, err = s.Store.Create(ctx, "Parent_Links", Record{"Name": str(lead, "Parent_Name"), "Student": studentID, "Parent_Email": strings.ToLower(str(lead, "Email")), "Relationship": "Guardian", "Status": "Active", "Unique_Key": linkKey})
		if err != nil {
			return nil, err
		}
	}
	enrollments, err := s.Store.List(ctx, "Enrollments")
	if err != nil {
		return nil, err
	}
	enrollmentKey := studentID + "-" + str(year, "id")
	if len(matching(enrollments, "Unique_Key", enrollmentKey)) == 0 {
		start := s.today()
		if start < str(year, "Start_Date") {
			start = str(year, "Start_Date")
		}
		_, err = s.Store.Create(ctx, "Enrollments", Record{"Name": str(student, "Name") + " · " + str(year, "Name"), "Student": studentID, "Section": str(section, "id"), "Academic_Year": str(year, "id"), "Start_Date": start, "Status": "Active", "Unique_Key": enrollmentKey})
		if err != nil {
			return nil, err
		}
	}
	return s.Store.Update(ctx, "Leads", leadID, Record{"Admission_Status": "Confirmed", "Student": studentID})
}

func (s *Service) Promote(ctx context.Context, enrollmentID, sectionID string) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, err := s.Store.Get(ctx, "Enrollments", enrollmentID)
	if err != nil {
		return nil, err
	}
	section, err := s.Store.Get(ctx, "Sections", sectionID)
	if err != nil {
		return nil, err
	}
	year, err := s.Store.Get(ctx, "Academic_Years", str(section, "Academic_Year"))
	if err != nil {
		return nil, err
	}
	oldYear, err := s.Store.Get(ctx, "Academic_Years", str(old, "Academic_Year"))
	if err != nil {
		return nil, err
	}
	if str(year, "Start_Date") <= str(oldYear, "End_Date") {
		return nil, fmt.Errorf("promotion requires a later, non-overlapping academic year")
	}
	rows, err := s.Store.List(ctx, "Enrollments")
	if err != nil {
		return nil, err
	}
	key := str(old, "Student") + "-" + str(year, "id")
	existing := matching(rows, "Unique_Key", key)
	var next Record
	if len(existing) > 0 {
		next = existing[0]
		if str(next, "Section") != sectionID {
			return nil, fmt.Errorf("student already enrolled in another section for that year")
		}
	} else {
		if str(old, "Status") != "Active" {
			return nil, fmt.Errorf("only active enrollments can be promoted")
		}
		for _, r := range rows {
			if str(r, "Student") == str(old, "Student") && str(r, "Status") == "Active" && str(r, "id") != enrollmentID {
				return nil, fmt.Errorf("resolve the other active enrollment first")
			}
		}
		next, err = s.Store.Create(ctx, "Enrollments", Record{"Name": str(old, "Name") + " → " + str(year, "Name"), "Student": str(old, "Student"), "Section": sectionID, "Academic_Year": str(year, "id"), "Start_Date": str(year, "Start_Date"), "Status": "Active", "Unique_Key": key})
		if err != nil {
			return nil, err
		}
	}
	if _, err = s.Store.Update(ctx, "Enrollments", enrollmentID, Record{"Status": "Completed"}); err != nil {
		return nil, fmt.Errorf("new enrollment created; retry promotion to finish closing the old enrollment: %w", err)
	}
	return next, nil
}

// Scope data on the server before returning any parent response. A caller never
// supplies their identity or an arbitrary child ID to this authorization step.
func parentDataset(d Dataset, email string) Dataset {
	out := Dataset{}
	for _, m := range modules {
		out[m.Key] = []Record{}
	}
	students := map[string]bool{}
	for _, l := range d["Parent_Links"] {
		if strings.EqualFold(str(l, "Parent_Email"), email) && str(l, "Status") == "Active" {
			students[str(l, "Student")] = true
		}
	}
	enrollments := map[string]bool{}
	sections := map[string]bool{}
	years := map[string]bool{}
	assessments := map[string]bool{}
	exams := map[string]bool{}
	papers := map[string]bool{}
	subjects := map[string]bool{}
	for _, r := range d["Students"] {
		if students[str(r, "id")] {
			out["Students"] = append(out["Students"], Record{"id": r["id"], "Name": r["Name"], "Student_ID": r["Student_ID"], "Date_of_Birth": r["Date_of_Birth"], "Status": r["Status"]})
		}
	}
	for _, r := range d["Enrollments"] {
		if students[str(r, "Student")] {
			out["Enrollments"] = append(out["Enrollments"], r)
			enrollments[str(r, "id")] = true
			sections[str(r, "Section")] = true
			years[str(r, "Academic_Year")] = true
		}
	}
	for _, m := range []string{"Attendance", "Results", "Fee_Assessments"} {
		for _, r := range d[m] {
			if enrollments[str(r, "Enrollment")] {
				copy := clone(r)
				delete(copy, "Notes")
				out[m] = append(out[m], copy)
				if m == "Fee_Assessments" {
					assessments[str(r, "id")] = true
				}
				if m == "Results" {
					papers[str(r, "Exam_Paper")] = true
				}
			}
		}
	}
	for _, r := range d["Payments"] {
		if assessments[str(r, "Fee_Assessment")] {
			out["Payments"] = append(out["Payments"], r)
		}
	}
	for _, r := range d["Exam_Papers"] {
		if papers[str(r, "id")] {
			out["Exam_Papers"] = append(out["Exam_Papers"], r)
			exams[str(r, "Exam")] = true
			subjects[str(r, "Subject")] = true
		}
	}
	for _, r := range d["Exams"] {
		if exams[str(r, "id")] {
			out["Exams"] = append(out["Exams"], r)
		}
	}
	classes := map[string]bool{}
	for _, r := range d["Sections"] {
		if sections[str(r, "id")] {
			out["Sections"] = append(out["Sections"], r)
			classes[str(r, "School_Class")] = true
		}
	}
	for m, ids := range map[string]map[string]bool{"Subjects": subjects, "School_Classes": classes, "Academic_Years": years} {
		for _, r := range d[m] {
			if ids[str(r, "id")] {
				out[m] = append(out[m], r)
			}
		}
	}
	return out
}
