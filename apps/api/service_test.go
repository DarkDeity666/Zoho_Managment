package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func fixture(t *testing.T) *Service {
	t.Helper()
	now := time.Now().UTC()
	return &Service{Store: &FileStore{Data: seedData(now)}, Config: Config{Mode: "demo", Location: time.UTC, Origin: "http://localhost:5173", AdminEmail: "admin@school.local", AdminPassword: "a-long-test-password", AlertThreshold: 75}}
}
func mustRows(t *testing.T, s *Service, module string) []Record {
	t.Helper()
	r, e := s.Store.List(context.Background(), module)
	if e != nil {
		t.Fatal(e)
	}
	return r
}
func TestAdmissionIsIdempotent(t *testing.T) {
	s := fixture(t)
	ctx := context.Background()
	before := len(mustRows(t, s, "Students"))
	for i := 0; i < 3; i++ {
		if _, err := s.Admit(ctx, "lead-0"); err != nil {
			t.Fatal(err)
		}
	}
	if len(mustRows(t, s, "Students")) != before+1 {
		t.Fatal("duplicate student")
	}
	lead, _ := s.Store.Get(ctx, "Leads", "lead-0")
	studentID := str(lead, "Student")
	if str(lead, "Admission_Status") != "Confirmed" || studentID == "" {
		t.Fatal(lead)
	}
	if len(matching(mustRows(t, s, "Enrollments"), "Student", studentID)) != 1 || len(matching(mustRows(t, s, "Parent_Links"), "Student", studentID)) != 1 {
		t.Fatal("duplicate linked records")
	}
}

type failOnceStore struct {
	Store
	failed bool
}

func (f *failOnceStore) Create(ctx context.Context, m string, r Record) (Record, error) {
	if m == "Enrollments" && !f.failed {
		f.failed = true
		return nil, errors.New("simulated network interruption")
	}
	return f.Store.Create(ctx, m, r)
}
func TestAdmissionResumesAfterPartialFailure(t *testing.T) {
	s := fixture(t)
	s.Store = &failOnceStore{Store: s.Store}
	ctx := context.Background()
	if _, err := s.Admit(ctx, "lead-0"); err == nil {
		t.Fatal("expected interrupted enrollment")
	}
	if _, err := s.Admit(ctx, "lead-0"); err != nil {
		t.Fatal(err)
	}
	if len(matching(mustRows(t, s, "Students"), "Admission_Key", "lead-0")) != 1 {
		t.Fatal("retry duplicated student")
	}
	if len(mustRows(t, s, "Parent_Links")) != 9 {
		t.Fatal("retry duplicated parent link")
	}
}
func TestAttendanceDateAndDuplicateRules(t *testing.T) {
	s := fixture(t)
	ctx := context.Background()
	input := Record{"Enrollment": "enrollment-1", "Attendance_Date": s.today(), "Status": "Present"}
	if _, err := s.Save(ctx, "Attendance", "", input); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Save(ctx, "Attendance", "", input); err == nil {
		t.Fatal("duplicate accepted")
	}
	input["Attendance_Date"] = time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	if _, err := s.Save(ctx, "Attendance", "", input); err == nil {
		t.Fatal("future date accepted")
	}
	input["Attendance_Date"] = "1900-01-01"
	if _, err := s.Save(ctx, "Attendance", "", input); err == nil {
		t.Fatal("pre-enrollment date accepted")
	}
}
func TestConcurrentAttendanceIsUnique(t *testing.T) {
	s := fixture(t)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := s.Save(context.Background(), "Attendance", "", Record{"Enrollment": "enrollment-1", "Attendance_Date": s.today(), "Status": "Present"})
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if success != 1 {
		t.Fatalf("accepted %d concurrent copies", success)
	}
}
func TestResultsValidateSectionMarksAndZero(t *testing.T) {
	s := fixture(t)
	ctx := context.Background()
	if _, err := s.Save(ctx, "Results", "result-0-0-0", Record{"Marks": float64(101)}); err == nil {
		t.Fatal("marks over maximum accepted")
	}
	zero, err := s.Save(ctx, "Results", "result-0-0-0", Record{"Marks": float64(0)})
	if err != nil || num(zero, "Percentage") != 0 || str(zero, "Grade") != "F" {
		t.Fatalf("zero marks: %v %v", zero, err)
	}
	if _, err := s.Save(ctx, "Results", "", Record{"Enrollment": "enrollment-1", "Exam_Paper": "paper-1-0", "Marks": float64(50)}); err == nil {
		t.Fatal("cross-section result accepted")
	}
	if _, err := s.Save(ctx, "Results", "", Record{"Enrollment": "enrollment-1", "Exam_Paper": "paper-0-0", "Marks": float64(50)}); err == nil {
		t.Fatal("duplicate result accepted")
	}
}
func TestPaymentsPositiveUniqueAndImmutable(t *testing.T) {
	s := fixture(t)
	ctx := context.Background()
	p := Record{"Fee_Assessment": "fee-0", "Payment_Date": s.today(), "Amount": float64(12.34), "Reference": "UPI-123", "Method": "UPI"}
	saved, err := s.Save(ctx, "Payments", "", p)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Save(ctx, "Payments", "", p); err == nil {
		t.Fatal("duplicate payment accepted")
	}
	p["Reference"] = "UPI-124"
	for _, amount := range []float64{0, -1, 10.001} {
		p["Amount"] = amount
		if _, err = s.Save(ctx, "Payments", "", p); err == nil {
			t.Fatalf("invalid amount %v accepted", amount)
		}
	}
	if _, err = s.Save(ctx, "Payments", str(saved, "id"), Record{"Amount": float64(999)}); err == nil {
		t.Fatal("ledger was editable")
	}
}
func TestPromotionPreservesHistoryAndIsRetryable(t *testing.T) {
	s := fixture(t)
	ctx := context.Background()
	before := len(mustRows(t, s, "Attendance"))
	if _, err := s.Promote(ctx, "enrollment-1", "section-8a"); err == nil {
		t.Fatal("same-year promotion accepted")
	}
	for i := 0; i < 2; i++ {
		if _, err := s.Promote(ctx, "enrollment-1", "section-8next"); err != nil {
			t.Fatal(err)
		}
	}
	enrollments := matching(mustRows(t, s, "Enrollments"), "Student", "student-1")
	if len(enrollments) != 2 {
		t.Fatal("promotion did not preserve two annual enrollments")
	}
	old, _ := s.Store.Get(ctx, "Enrollments", "enrollment-1")
	if str(old, "Status") != "Completed" || len(mustRows(t, s, "Attendance")) != before {
		t.Fatal("history changed")
	}
}
func TestParentIsolationAndRevocation(t *testing.T) {
	s := fixture(t)
	d, _ := s.dataset(context.Background())
	p := parentDataset(d, "parent@school.local")
	if len(p["Students"]) != 2 {
		t.Fatal("siblings not linked")
	}
	for _, r := range p["Students"] {
		if str(r, "id") == "student-3" {
			t.Fatal("other child leaked")
		}
	}
	for _, m := range []string{"Leads", "Parent_Links", "Teachers"} {
		if len(p[m]) != 0 {
			t.Fatal("private module leaked", m)
		}
	}
	if len(p["Payments"]) != 2 {
		t.Fatal("unrelated payments leaked")
	}
	for _, r := range d["Parent_Links"] {
		if str(r, "Parent_Email") == "parent@school.local" {
			r["Status"] = "Revoked"
		}
	}
	p = parentDataset(d, "parent@school.local")
	if len(p["Students"]) != 0 || len(p["Payments"]) != 0 {
		t.Fatal("revocation not enforced")
	}
}
func TestDerivedFieldsCannotBeForged(t *testing.T) {
	s := fixture(t)
	for _, input := range []Record{{"Student_ID": "forged"}, {"Admission_Key": "stolen"}, {"id": "student-2"}, {"unknown": "secret"}} {
		if _, err := s.Save(context.Background(), "Students", "student-1", input); err == nil {
			t.Fatal("protected field accepted", input)
		}
	}
}
func TestDemoStorePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "demo.json")
	store, err := NewFileStore(path, Dataset{})
	if err != nil {
		t.Fatal(err)
	}
	saved, err := store.Create(context.Background(), "Subjects", Record{"Name": "Art", "Code": "ART"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.Update(context.Background(), "Subjects", str(saved, "id"), Record{"Name": "Fine Art"}); err != nil {
		t.Fatal(err)
	}
	reopened, err := NewFileStore(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	record, err := reopened.Get(context.Background(), "Subjects", str(saved, "id"))
	if err != nil || str(record, "Name") != "Fine Art" {
		t.Fatal("not durable", err)
	}
}
func TestHTTPRoleOriginAndAdmissionBoundary(t *testing.T) {
	s := fixture(t)
	app := &Server{service: s, sessions: map[string]Session{}, rates: map[string]rateEntry{}}
	handler := app.handler()
	request := func(method, path, body, origin string, cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Origin", origin)
		if cookie != nil {
			req.AddCookie(cookie)
		}
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		return out
	}
	if r := request("GET", "/api/workspace", "", "", nil); r.Code != 401 {
		t.Fatal(r.Code)
	}
	if r := request("POST", "/api/demo-login", `{"role":"staff"}`, "https://evil.example", nil); r.Code != 403 {
		t.Fatal("cross-site mutation permitted")
	}
	login := request("POST", "/api/demo-login", `{"role":"parent"}`, s.Config.Origin, nil)
	if login.Code != 200 {
		t.Fatal(login.Body)
	}
	cookie := login.Result().Cookies()[0]
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("insecure session cookie")
	}
	if r := request("POST", "/api/records/Students", `{"Name":"attacker"}`, s.Config.Origin, cookie); r.Code != 403 {
		t.Fatal("parent wrote staff records")
	}
	r := request("GET", "/api/workspace?student_id=student-3", "", "", cookie)
	if bytes.Contains(r.Body.Bytes(), []byte("Ishaan Patel")) {
		t.Fatal("IDOR leaked another student")
	}
	var body Record
	if json.Unmarshal(r.Body.Bytes(), &body) != nil {
		t.Fatal("invalid JSON")
	}
	if r := request("POST", "/api/admissions", `{"Admission_Status":"Confirmed"}`, s.Config.Origin, nil); r.Code != 400 {
		t.Fatal("public user controlled status")
	}
	if r := request("POST", "/api/logout", `{}`, s.Config.Origin, cookie); r.Code != 200 {
		t.Fatal(r.Code)
	}
	if r := request("GET", "/api/workspace", "", "", cookie); r.Code != 401 {
		t.Fatal("logged-out session stayed valid")
	}
}
func TestDemoLoginDisabledInZohoMode(t *testing.T) {
	s := fixture(t)
	s.Config.Mode = "zoho"
	app := &Server{service: s, sessions: map[string]Session{}, rates: map[string]rateEntry{}}
	req := httptest.NewRequest("POST", "/api/demo-login", strings.NewReader(`{"role":"staff"}`))
	req.Header.Set("Origin", s.Config.Origin)
	out := httptest.NewRecorder()
	app.handler().ServeHTTP(out, req)
	if out.Code != 404 {
		t.Fatal("demo bypass exposed in live mode")
	}
}
