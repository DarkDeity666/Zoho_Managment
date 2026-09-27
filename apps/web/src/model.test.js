import { describe, it, expect } from "vitest";
import { attendance, feeSummary, performance, alerts, csvText } from "./model";
describe("school reporting rules", () => {
  it("counts late as attended, excludes excused, and distinguishes missing data", () => {
    expect(attendance([]).percentage).toBeNull();
    expect(
      attendance([
        { Status: "Present" },
        { Status: "Late" },
        { Status: "Absent" },
        { Status: "Excused" },
      ]),
    ).toEqual({ total: 3, present: 2, percentage: 66.7 });
  });
  it("adds installments in cents, detects overdue balances and preserves excess as credit", () => {
    const fee = { id: "f1", Amount: 0.3, Due_Date: "2026-01-01" };
    const data = {
      Payments: [
        { Fee_Assessment: "f1", Amount: 0.1 },
        { Fee_Assessment: { id: "f1" }, Amount: 0.2 },
        { Fee_Assessment: "other", Amount: 200 },
      ],
    };
    expect(feeSummary(data, fee, "2026-01-02")).toEqual({
      collected: 0.3,
      outstanding: 0,
      credit: 0,
      status: "Paid",
    });
    expect(feeSummary(data, { ...fee, Amount: 1 }, "2026-01-02").status).toBe(
      "Overdue",
    );
    expect(feeSummary(data, { ...fee, Amount: 0.2 }, "2026-01-02").credit).toBe(
      0.1,
    );
  });
  it("weights academic performance by paper maximum rather than averaging percentages", () => {
    const data = {
      Exam_Papers: [
        { id: "p1", Max_Marks: 100 },
        { id: "p2", Max_Marks: 50 },
      ],
    };
    expect(
      performance(data, [
        { Exam_Paper: "p1", Marks: 50 },
        { Exam_Paper: "p2", Marks: 50 },
      ]),
    ).toBe(66.7);
    expect(performance(data, [])).toBeNull();
  });
  it("requires five recorded days before raising an attendance concern", () => {
    const data = {
      Students: [{ id: "s1", Name: "Student" }],
      Enrollments: [{ id: "e1", Student: "s1", Status: "Active" }],
      Attendance: Array.from({ length: 4 }, (_, i) => ({
        Enrollment: "e1",
        Status: "Absent",
        Attendance_Date: `2026-01-0${i + 1}`,
      })),
    };
    expect(alerts(data, "2026-01-10")).toHaveLength(0);
    data.Attendance.push({
      Enrollment: "e1",
      Status: "Absent",
      Attendance_Date: "2026-01-05",
    });
    expect(alerts(data, "2026-01-10")).toHaveLength(1);
  });
  it("escapes CSV quotes and neutralizes spreadsheet formulas", () => {
    const csv = csvText(
      [{ Name: '=HYPERLINK("https://evil")' }, { Name: "A,B" }],
      [{ key: "Name", label: "Name" }],
    );
    expect(csv).toContain(`"'=HYPERLINK(""https://evil"")"`);
    expect(csv).toContain('"A,B"');
  });
});
