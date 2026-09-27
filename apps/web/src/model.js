export const ref = (value) =>
  typeof value === "object" && value !== null
    ? String(value.id || "")
    : String(value ?? "");
export const rows = (data, module) => data?.[module] || [];
export const lookup = (data, module, id) =>
  rows(data, module).find((r) => r.id === ref(id)) || {};
export const label = (data, module, id) => {
  const r = lookup(data, module, id);
  return r.Name || r.Last_Name || "—";
};
export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
export const initials = (name) =>
  (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
export const dateLabel = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export function attendance(records) {
  const counted = records.filter((r) => r.Status !== "Excused");
  const present = counted.filter((r) =>
    ["Present", "Late"].includes(r.Status),
  ).length;
  return {
    total: counted.length,
    present,
    percentage: counted.length
      ? Math.round((present / counted.length) * 1000) / 10
      : null,
  };
}
export function feeSummary(data, fee, today) {
  const collectedCents = rows(data, "Payments")
    .filter((p) => ref(p.Fee_Assessment) === fee.id)
    .reduce((sum, p) => sum + Math.round(p.Amount * 100), 0);
  const totalCents = Math.round(fee.Amount * 100);
  const outstanding = Math.max(0, totalCents - collectedCents) / 100;
  return {
    collected: collectedCents / 100,
    outstanding,
    credit: Math.max(0, collectedCents - totalCents) / 100,
    status: !outstanding
      ? "Paid"
      : fee.Due_Date < today
        ? "Overdue"
        : collectedCents
          ? "Partial"
          : "Unpaid",
  };
}
export function performance(data, results) {
  let marks = 0,
    max = 0;
  for (const r of results) {
    const paper = lookup(data, "Exam_Papers", r.Exam_Paper);
    marks += Number(r.Marks || 0);
    max += Number(paper.Max_Marks || 0);
  }
  return max ? Math.round((marks / max) * 1000) / 10 : null;
}
export function alerts(data, today, threshold = 75) {
  const result = [];
  for (const e of rows(data, "Enrollments").filter(
    (e) => e.Status === "Active",
  )) {
    const recent = rows(data, "Attendance")
      .filter((a) => ref(a.Enrollment) === e.id)
      .sort((a, b) => b.Attendance_Date.localeCompare(a.Attendance_Date))
      .slice(0, 30);
    const rate = attendance(recent);
    if (rate.total >= 5 && rate.percentage < threshold)
      result.push({
        id: `attendance-${e.id}`,
        student: lookup(data, "Students", e.Student),
        enrollment: e,
        type: "Attendance",
        detail: `${rate.percentage}% over the last ${rate.total} recorded school days`,
        action: "Arrange a parent check-in",
        priority: "High",
      });
  }
  for (const fee of rows(data, "Fee_Assessments")) {
    const summary = feeSummary(data, fee, today);
    if (summary.status === "Overdue") {
      const e = lookup(data, "Enrollments", fee.Enrollment);
      result.push({
        id: `fee-${fee.id}`,
        student: lookup(data, "Students", e.Student),
        enrollment: e,
        type: "Overdue fee",
        detail: `${money(summary.outstanding)} outstanding · due ${dateLabel(fee.Due_Date)}`,
        action: "Follow up with the parent",
        priority: "Medium",
      });
    }
  }
  return result;
}
export function csvText(records, fields) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [
    fields.map((f) => cell(f.label)).join(","),
    ...records.map((r) =>
      fields.map((f) => cell(f.get ? f.get(r) : r[f.key])).join(","),
    ),
  ].join("\r\n");
}
export function exportCSV(records, fields, name) {
  const url = URL.createObjectURL(
    new Blob(["\ufeff", csvText(records, fields)], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
