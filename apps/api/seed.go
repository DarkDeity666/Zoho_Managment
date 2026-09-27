package main

import (
	"fmt"
	"time"
)

func seedData(now time.Time) Dataset {
	d := Dataset{}
	for _, m := range modules {
		d[m.Key] = []Record{}
	}
	year := now.Year()
	if now.Month() < 4 {
		year--
	}
	start := fmt.Sprintf("%d-04-01", year)
	end := fmt.Sprintf("%d-03-31", year+1)
	d["Academic_Years"] = []Record{{"id": "year-current", "Name": fmt.Sprintf("%d–%d", year, year+1), "Start_Date": start, "End_Date": end}, {"id": "year-next", "Name": fmt.Sprintf("%d–%d", year+1, year+2), "Start_Date": fmt.Sprintf("%d-04-01", year+1), "End_Date": fmt.Sprintf("%d-03-31", year+2)}}
	d["School_Classes"] = []Record{{"id": "class-7", "Name": "Grade 7", "Grade": float64(7)}, {"id": "class-8", "Name": "Grade 8", "Grade": float64(8)}, {"id": "class-9", "Name": "Grade 9", "Grade": float64(9)}}
	d["Sections"] = []Record{{"id": "section-7a", "Name": "7 A", "School_Class": "class-7", "Academic_Year": "year-current", "Unique_Key": "year-current-class-7-7 a"}, {"id": "section-8a", "Name": "8 A", "School_Class": "class-8", "Academic_Year": "year-current", "Unique_Key": "year-current-class-8-8 a"}, {"id": "section-8next", "Name": "8 A · next year", "School_Class": "class-8", "Academic_Year": "year-next", "Unique_Key": "year-next-class-8-8 a"}, {"id": "section-9next", "Name": "9 A · next year", "School_Class": "class-9", "Academic_Year": "year-next", "Unique_Key": "year-next-class-9-9 a"}}
	d["Subjects"] = []Record{{"id": "sub-math", "Name": "Mathematics", "Code": "MATH"}, {"id": "sub-science", "Name": "Science", "Code": "SCI"}, {"id": "sub-english", "Name": "English", "Code": "ENG"}}
	d["Teachers"] = []Record{{"id": "teacher-1", "Name": "Ananya Rao", "Email": "ananya@example.test", "Phone": ""}, {"id": "teacher-2", "Name": "Kiran Mehta", "Email": "kiran@example.test", "Phone": ""}, {"id": "teacher-3", "Name": "Sara Thomas", "Email": "sara@example.test", "Phone": ""}}
	for i, subject := range d["Subjects"] {
		for _, section := range []string{"section-7a", "section-8a"} {
			d["Teaching_Assignments"] = append(d["Teaching_Assignments"], Record{"id": fmt.Sprintf("teaching-%d-%s", i, section), "Name": str(subject, "Name"), "Section": section, "Subject": str(subject, "id"), "Teacher": fmt.Sprintf("teacher-%d", i+1), "Unique_Key": section + "-" + str(subject, "id")})
		}
	}
	names := []string{"Aarav Sharma", "Diya Sharma", "Ishaan Patel", "Ananya Gupta", "Vihaan Reddy", "Meera Nair", "Arjun Singh", "Saanvi Rao"}
	for i, name := range names {
		studentID := fmt.Sprintf("student-%d", i+1)
		enrollmentID := fmt.Sprintf("enrollment-%d", i+1)
		section := "section-7a"
		if i >= 4 {
			section = "section-8a"
		}
		email := fmt.Sprintf("parent%d@example.test", i+1)
		if i < 2 {
			email = "parent@school.local"
		}
		if i == 2 {
			email = "other.parent@school.local"
		}
		d["Students"] = append(d["Students"], Record{"id": studentID, "Name": name, "Student_ID": fmt.Sprintf("GF-%d-%03d", year, i+1), "Date_of_Birth": fmt.Sprintf("%d-02-%02d", year-12, i+10), "Status": "Active"})
		d["Enrollments"] = append(d["Enrollments"], Record{"id": enrollmentID, "Name": name + " · " + str(find(d["Sections"], section), "Name"), "Student": studentID, "Section": section, "Academic_Year": "year-current", "Start_Date": start, "Status": "Active", "Unique_Key": studentID + "-year-current"})
		d["Parent_Links"] = append(d["Parent_Links"], Record{"id": fmt.Sprintf("link-%d", i), "Name": "Parent of " + name, "Student": studentID, "Parent_Email": email, "Relationship": "Guardian", "Status": "Active", "Unique_Key": studentID + "-" + email})
		count := 0
		for day := 1; day < 30 && count < 16; day++ {
			date := now.AddDate(0, 0, -day)
			if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday || date.Format("2006-01-02") < start {
				continue
			}
			status := "Present"
			if (i == 2 && count%2 == 0) || (i == 4 && count%3 == 0) {
				status = "Absent"
			} else if count == (i+1)%12 {
				status = "Late"
			}
			d["Attendance"] = append(d["Attendance"], Record{"id": fmt.Sprintf("att-%d-%d", i, count), "Name": name, "Enrollment": enrollmentID, "Attendance_Date": date.Format("2006-01-02"), "Status": status, "Unique_Key": enrollmentID + "-" + date.Format("2006-01-02")})
			count++
		}
		feeID := fmt.Sprintf("fee-%d", i)
		d["Fee_Assessments"] = append(d["Fee_Assessments"], Record{"id": feeID, "Name": "Term 1 tuition", "Enrollment": enrollmentID, "Amount": float64(42000), "Due_Date": now.AddDate(0, 0, -7).Format("2006-01-02")})
		amount := float64(42000)
		if i == 2 || i == 4 {
			amount = 20000
		}
		if i == 6 {
			amount = 32000
		}
		d["Payments"] = append(d["Payments"], Record{"id": fmt.Sprintf("payment-%d", i), "Name": "Term 1 payment", "Fee_Assessment": feeID, "Amount": amount, "Payment_Date": now.AddDate(0, 0, -15).Format("2006-01-02"), "Reference": fmt.Sprintf("DEMO-REC-%03d", i+1), "Method": "Bank Transfer"})
	}
	examDate := now.AddDate(0, 0, -5).Format("2006-01-02")
	if examDate < start {
		examDate = start
	}
	for j, section := range []string{"section-7a", "section-8a"} {
		examID := fmt.Sprintf("exam-%d", j)
		d["Exams"] = append(d["Exams"], Record{"id": examID, "Name": "Term 1 assessment", "Section": section, "Exam_Date": examDate})
		for k, sub := range d["Subjects"] {
			paperID := fmt.Sprintf("paper-%d-%d", j, k)
			d["Exam_Papers"] = append(d["Exam_Papers"], Record{"id": paperID, "Name": str(sub, "Name") + " · " + str(find(d["Sections"], section), "Name"), "Exam": examID, "Subject": str(sub, "id"), "Max_Marks": float64(100), "Pass_Marks": float64(40), "Unique_Key": examID + "-" + str(sub, "id")})
			for i, en := range d["Enrollments"] {
				if str(en, "Section") != section {
					continue
				}
				marks := float64(67 + (i*7+k*9)%31)
				d["Results"] = append(d["Results"], Record{"id": fmt.Sprintf("result-%d-%d-%d", j, k, i), "Name": names[i], "Enrollment": str(en, "id"), "Exam_Paper": paperID, "Marks": marks, "Percentage": marks, "Grade": grade(marks), "Unique_Key": str(en, "id") + "-" + paperID})
			}
		}
	}
	stages := []string{"New", "New", "Contacted", "Visit Scheduled", "Rejected"}
	for i, stage := range stages {
		d["Leads"] = append(d["Leads"], Record{"id": fmt.Sprintf("lead-%d", i), "Last_Name": []string{"Rohan Kapoor", "Tara Menon", "Kabir Joshi", "Zoya Khan", "Neil Das"}[i], "Parent_Name": []string{"Priya Kapoor", "Dev Menon", "Raj Joshi", "Aisha Khan", "Amit Das"}[i], "Email": fmt.Sprintf("admission%d@example.test", i), "Phone": "", "Date_of_Birth": fmt.Sprintf("%d-03-12", year-12), "Desired_Section": "section-7a", "Admission_Status": stage, "Follow_Up_Date": now.AddDate(0, 0, i-1).Format("2006-01-02"), "Notes": "Demo admission enquiry"})
	}
	return d
}
