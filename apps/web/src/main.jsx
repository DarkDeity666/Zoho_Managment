import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  Wallet,
  Bell,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  LogOut,
  X,
  Check,
  Download,
  RefreshCw,
  ShieldCheck,
  Menu,
  School,
  Mail,
  ExternalLink,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
import schema from "../../../packages/schema/schema.json";
import {
  ref,
  rows,
  lookup,
  label,
  money,
  initials,
  dateLabel,
  attendance,
  feeSummary,
  performance,
  alerts,
  exportCSV,
} from "./model";
import "./style.css";

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The API is unavailable. Start the Go server and try again.",
    );
  }
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "admissions", label: "Admissions", icon: ClipboardList },
  { id: "students", label: "Students", icon: Users },
  { id: "academics", label: "Academics", icon: BookOpen },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "examinations", label: "Examinations", icon: GraduationCap },
  { id: "fees", label: "Fees & payments", icon: Wallet },
];
const Badge = ({ children, tone }) => (
  <span
    className={`badge ${tone || (["Active", "Present", "Paid", "Confirmed", "A+", "A"].includes(children) ? "green" : ["Overdue", "Absent", "Rejected", "F", "High"].includes(children) ? "red" : ["Late", "Partial", "Visit Scheduled", "Medium"].includes(children) ? "amber" : "neutral")}`}
  >
    {children}
  </span>
);
const Empty = ({
  title = "Nothing here yet",
  text = "Add a record to get started.",
}) => (
  <div className="empty">
    <BookOpen size={30} />
    <h3>{title}</h3>
    <p>{text}</p>
  </div>
);
const Avatar = ({ name, small }) => (
  <span className={`avatar ${small ? "small" : ""}`}>{initials(name)}</span>
);
const Percent = ({ value }) =>
  value === null ? (
    <span className="muted">No records</span>
  ) : (
    <div className="percentage">
      <span>{value}%</span>
      <i>
        <b style={{ width: `${Math.min(100, value)}%` }} />
      </i>
    </div>
  );

function App() {
  const [meta, setMeta] = useState(null),
    [user, setUser] = useState(null),
    [workspace, setWorkspace] = useState(null),
    [page, setPage] = useState("overview"),
    [query, setQuery] = useState(""),
    [year, setYear] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [selectedStudent, setSelectedStudent] = useState(null),
    [publicPage, setPublicPage] = useState(location.hash === "#apply");
  const data = workspace?.data || {};
  async function refresh() {
    setBusy(true);
    try {
      const next = await api("/workspace");
      setWorkspace(next);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    Promise.all([
      api("/public").then(setMeta),
      api("/session")
        .then(setUser)
        .catch(() => {}),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const change = () => setPublicPage(location.hash === "#apply");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (user) refresh();
    else setWorkspace(null);
  }, [user]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);
  function navigate(id) {
    setPage(id);
    setQuery("");
    setSelectedStudent(null);
    setMobile(false);
  }
  async function mutate(path, body, message, method = "POST") {
    setBusy(true);
    try {
      const result = await api(path, { method, body });
      await refresh();
      setToast(message);
      return result;
    } finally {
      setBusy(false);
    }
  }
  function create(module, defaults = {}) {
    setModal({ module, defaults });
  }
  if (loading)
    return (
      <div className="loading-page">
        <School size={38} />
        <p>Opening your school workspace…</p>
      </div>
    );
  if (publicPage)
    return (
      <AdmissionPage
        meta={meta}
        api={api}
        onBack={() => {
          location.hash = "";
          setPublicPage(false);
        }}
      />
    );
  if (!user)
    return (
      <Login
        meta={meta}
        error={error}
        onLogin={setUser}
        onApply={() => {
          location.hash = "apply";
          setPublicPage(true);
        }}
      />
    );
  const today = workspace?.today || new Date().toLocaleDateString("en-CA");
  const allAlerts = alerts(data, today, workspace?.alertThreshold);
  const yearEnrollments = rows(data, "Enrollments").filter(
    (e) => !year || ref(e.Academic_Year) === year,
  );
  const yearIDs = new Set(yearEnrollments.map((e) => e.id));
  const filteredData = {
    ...data,
    Enrollments: yearEnrollments,
    Attendance: rows(data, "Attendance").filter((r) =>
      yearIDs.has(ref(r.Enrollment)),
    ),
    Results: rows(data, "Results").filter((r) =>
      yearIDs.has(ref(r.Enrollment)),
    ),
    Fee_Assessments: rows(data, "Fee_Assessments").filter((r) =>
      yearIDs.has(ref(r.Enrollment)),
    ),
  };
  const actions = {
    create,
    setModal,
    mutate,
    navigate,
    openStudent: (id) => {
      setSelectedStudent(id);
      setPage("students");
    },
  };
  const titles = {
    overview: [
      "A little clarity. A better school day.",
      "Your school, at a glance",
    ],
    admissions: ["Every great journey starts here.", "Admissions"],
    students: ["Know every learner’s story.", "Students"],
    academics: ["A strong foundation for learning.", "Academic structure"],
    attendance: ["Every school day counts.", "Attendance"],
    examinations: ["Make progress visible.", "Examinations & results"],
    fees: ["Keep school finances in focus.", "Fees & payments"],
    followups: ["Small actions. Meaningful support.", "Follow-up queue"],
    settings: ["Connected, with care.", "Workspace settings"],
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <School size={23} />
          </span>
          <span>
            schooldesk<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="school-switch">
          <span className="school-monogram">G</span>
          <div>
            <strong>{workspace?.school || meta?.school}</strong>
            <small>School workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">
          {user.role === "parent" ? "PARENT PORTAL" : "WORKSPACE"}
        </div>
        <nav>
          {user.role === "parent" ? (
            <button className="nav-item active">
              <Users size={19} />
              My children
            </button>
          ) : (
            nav.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={19} />
                {item.label}
                {item.id === "admissions" && (
                  <span className="nav-count">
                    {
                      rows(data, "Leads").filter(
                        (l) => l.Admission_Status === "New",
                      ).length
                    }
                  </span>
                )}
              </button>
            ))
          )}
        </nav>
        {user.role === "staff" && (
          <>
            <div className="nav-label management-label">MANAGEMENT</div>
            <button
              className={`nav-item ${page === "followups" ? "active" : ""}`}
              onClick={() => navigate("followups")}
            >
              <Bell size={19} />
              Follow-ups
              <span className="nav-count orange">{allAlerts.length}</span>
            </button>
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Settings size={19} />
              Settings
            </button>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="connection-card">
            <span
              className={`status-dot ${workspace?.mode === "zoho" ? "" : "demo-dot"}`}
            />
            <div>
              <strong>
                {workspace?.mode === "zoho"
                  ? "Zoho CRM connected"
                  : "Local demo workspace"}
              </strong>
              <p>
                {workspace?.mode === "zoho"
                  ? "CRM is your source of truth"
                  : "Explore with sample school data"}
              </p>
            </div>
          </div>
          <button
            className="profile"
            onClick={async () => {
              await api("/logout", { method: "POST", body: {} });
              setUser(null);
            }}
          >
            <Avatar name={user.name} small />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "parent" ? "Parent access" : "Administrator"}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>
              {user.role === "parent" ? "Parent portal" : titles[page]?.[1]}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="date-today">{dateLabel(today)}</span>
            <button
              className={`icon-button ${busy ? "spinning" : ""}`}
              title="Refresh data"
              aria-label="Refresh data"
              disabled={busy}
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="icon-button notification"
              aria-label="View follow-ups"
              onClick={() => user.role === "staff" && navigate("followups")}
            >
              <Bell size={19} />
              {!!allAlerts.length && user.role === "staff" && <i />}
            </button>
            <Avatar name={user.name} small />
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              {error}
              <button onClick={refresh}>Retry</button>
            </div>
          )}
          {!workspace ? (
            <div className="empty">
              {error
                ? "Workspace could not be loaded."
                : "Loading school records…"}
            </div>
          ) : user.role === "parent" ? (
            <ParentPortal data={data} today={today} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{titles[page]?.[0]}</div>
                  <h1>
                    {selectedStudent
                      ? label(data, "Students", selectedStudent)
                      : titles[page]?.[1]}
                  </h1>
                </div>
                <div className="heading-actions">
                  {page === "overview" && (
                    <select
                      aria-label="Academic year"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    >
                      <option value="">All academic years</option>
                      {rows(data, "Academic_Years").map((y) => (
                        <option value={y.id} key={y.id}>
                          {y.Name}
                        </option>
                      ))}
                    </select>
                  )}
                  {page !== "settings" && (
                    <button
                      className="primary"
                      onClick={() =>
                        create(
                          {
                            admissions: "Leads",
                            students: "Students",
                            academics: "Academic_Years",
                            attendance: "Attendance",
                            examinations: "Exams",
                            fees: "Payments",
                          }[page] || "Leads",
                        )
                      }
                    >
                      <Plus size={17} />
                      {{
                        admissions: "New enquiry",
                        students: "Add student",
                        academics: "Academic year",
                        attendance: "Record attendance",
                        examinations: "New examination",
                        fees: "Record payment",
                      }[page] || "New admission"}
                    </button>
                  )}
                </div>
              </div>
              {page === "overview" && (
                <Overview
                  data={filteredData}
                  today={today}
                  threshold={workspace.alertThreshold}
                  actions={actions}
                />
              )}
              {page === "admissions" && (
                <Admissions
                  data={data}
                  query={query}
                  setQuery={setQuery}
                  actions={actions}
                />
              )}
              {page === "students" &&
                (selectedStudent ? (
                  <StudentDetail
                    data={data}
                    studentID={selectedStudent}
                    today={today}
                    actions={actions}
                    onBack={() => setSelectedStudent(null)}
                  />
                ) : (
                  <Students
                    data={data}
                    query={query}
                    setQuery={setQuery}
                    actions={actions}
                  />
                ))}
              {page === "academics" && (
                <ResourceTabs
                  data={data}
                  modules={[
                    "Academic_Years",
                    "School_Classes",
                    "Sections",
                    "Subjects",
                    "Teachers",
                    "Teaching_Assignments",
                    "Enrollments",
                    "Parent_Links",
                  ]}
                  actions={actions}
                />
              )}
              {page === "attendance" && (
                <AttendancePage data={data} today={today} actions={actions} />
              )}
              {page === "examinations" && (
                <>
                  <ExamSummary data={data} />
                  <ResourceTabs
                    data={data}
                    modules={["Exams", "Exam_Papers", "Results"]}
                    actions={actions}
                  />
                </>
              )}
              {page === "fees" && (
                <Fees data={data} today={today} actions={actions} />
              )}
              {page === "followups" && (
                <Followups
                  data={data}
                  today={today}
                  threshold={workspace.alertThreshold}
                  actions={actions}
                />
              )}
              {page === "settings" && <SettingsPage meta={meta} user={user} />}
            </>
          )}
          <footer className="page-footer">
            <span>Thoughtfully connected. Schooldesk.</span>
            <span>
              <ShieldCheck size={13} />{" "}
              {workspace?.mode === "zoho"
                ? "Live CRM data"
                : "Demo data · stored on this computer"}
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <RecordModal
          key={`${modal.module}-${modal.record?.id || ""}`}
          modal={modal}
          data={data}
          today={today}
          onClose={() => setModal(null)}
          onSave={async (input) => {
            await mutate(
              `/records/${modal.module}${modal.record ? `/${modal.record.id}` : ""}`,
              input,
              "Record saved successfully",
              modal.record ? "PATCH" : "POST",
            );
            setModal(null);
          }}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({ data, today, threshold, actions }) {
  const active = rows(data, "Enrollments").filter((e) => e.Status === "Active"),
    rate = attendance(rows(data, "Attendance")),
    collected = rows(data, "Fee_Assessments").reduce(
      (n, f) => n + feeSummary(data, f, today).collected,
      0,
    ),
    outstanding = rows(data, "Fee_Assessments").reduce(
      (n, f) => n + feeSummary(data, f, today).outstanding,
      0,
    ),
    flags = alerts(data, today, threshold);
  const dateRows = [
    ...new Set(rows(data, "Attendance").map((r) => r.Attendance_Date)),
  ]
    .sort()
    .slice(-7);
  return (
    <>
      <section className="welcome-banner">
        <div>
          <div className="banner-tag">
            <span /> A CONNECTED SCHOOL DAY
          </div>
          <h2>
            Less administration.
            <br />
            <em>More room to grow.</em>
          </h2>
          <p>Bring your students, people, and processes together.</p>
          <button onClick={() => actions.navigate("followups")}>
            View today’s priorities <ArrowRight size={17} />
          </button>
        </div>
        <div className="banner-graphic" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="graphic-card card-back">
            <BookOpen size={35} />
            <span>Keep learning.</span>
          </div>
          <div className="graphic-card card-front">
            <span className="graphic-check">
              <Check size={24} />
            </span>
            <strong>
              Every student.
              <br />
              Every step.
            </strong>
            <div className="mini-avatars">
              <i>AS</i>
              <i>MR</i>
              <i>VP</i>
              <i>+</i>
            </div>
          </div>
          <span className="graphic-star">✳</span>
        </div>
      </section>
      <div className="stat-grid">
        <Stat
          title="Active enrollments"
          value={active.length}
          detail="Across selected academic years"
          icon={Users}
          tone="sage"
        />
        <Stat
          title="Open enquiries"
          value={
            rows(data, "Leads").filter(
              (l) => !["Confirmed", "Rejected"].includes(l.Admission_Status),
            ).length
          }
          detail="Admissions in progress"
          icon={ClipboardList}
          tone="sand"
        />
        <Stat
          title="Attendance rate"
          value={rate.percentage === null ? "—" : `${rate.percentage}%`}
          detail={`${rate.total} recorded student-days`}
          icon={CalendarCheck}
          tone="lavender"
        />
        <Stat
          title="Fees collected"
          value={money(collected)}
          detail={`${money(outstanding)} outstanding`}
          icon={Wallet}
          tone="peach"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel attendance-panel">
          <PanelTitle
            title="Attendance pulse"
            sub="Last 7 recorded school days"
            right={
              <span className="chart-legend">
                <i />
                Present & late
              </span>
            }
          />
          <div className="bar-chart">
            <div className="chart-labels">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div className="chart-columns">
              {dateRows.length ? (
                dateRows.map((date, i) => {
                  const a = attendance(
                    rows(data, "Attendance").filter(
                      (r) => r.Attendance_Date === date,
                    ),
                  );
                  return (
                    <div className="chart-column" key={date}>
                      <span className="bar-value">{a.percentage ?? 0}%</span>
                      <div className="bar-track">
                        <div
                          className={i === dateRows.length - 1 ? "last" : ""}
                          style={{ height: `${a.percentage || 0}%` }}
                        />
                      </div>
                      <small>
                        {new Date(`${date}T12:00:00`).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short" },
                        )}
                      </small>
                    </div>
                  );
                })
              ) : (
                <Empty title="No attendance yet" />
              )}
            </div>
          </div>
        </section>
        <section className="panel quick-actions">
          <PanelTitle
            title="A head start"
            sub="Make the everyday a little easier"
          />
          {[
            {
              title: "Welcome a new student",
              text: "Capture an admission enquiry",
              icon: Users,
              module: "Leads",
              color: "sage",
            },
            {
              title: "Take attendance",
              text: "Keep today’s records up to date",
              icon: CalendarCheck,
              module: "Attendance",
              color: "lavender",
            },
            {
              title: "Record a payment",
              text: "Track every installment",
              icon: Wallet,
              module: "Payments",
              color: "peach",
            },
          ].map((a) => (
            <button key={a.module} onClick={() => actions.create(a.module)}>
              <span className={`action-icon ${a.color}`}>
                <a.icon size={21} />
              </span>
              <span>
                <strong>{a.title}</strong>
                <small>{a.text}</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
          <div className="quick-note">
            <ShieldCheck size={16} />
            One connected record, from admission onward.
          </div>
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="panel">
          <PanelTitle
            title="Students at a glance"
            sub="A closer look at your school community"
            right={
              <button
                className="text-button"
                onClick={() => actions.navigate("students")}
              >
                View all <ArrowRight size={15} />
              </button>
            }
          />
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Attendance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {active.slice(0, 5).map((e) => {
                const s = lookup(data, "Students", e.Student);
                return (
                  <tr
                    key={e.id}
                    onClick={() => actions.openStudent(s.id)}
                    className="clickable"
                  >
                    <td>
                      <div className="person">
                        <Avatar name={s.Name} small />
                        <div>
                          <strong>{s.Name}</strong>
                          <small>{s.Student_ID}</small>
                        </div>
                      </div>
                    </td>
                    <td>{label(data, "Sections", e.Section)}</td>
                    <td>
                      <Percent
                        value={
                          attendance(
                            rows(data, "Attendance").filter(
                              (a) => ref(a.Enrollment) === e.id,
                            ),
                          ).percentage
                        }
                      />
                    </td>
                    <td>
                      <Badge>{s.Status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!active.length && <Empty title="No active enrollments" />}
        </section>
        <section className="panel priorities">
          <PanelTitle
            title="Needs a little attention"
            sub={`${flags.length} items to follow up`}
            right={
              <span className="soft-icon">
                <Bell size={18} />
              </span>
            }
          />
          {flags.slice(0, 3).map((a) => (
            <button
              className="priority-item"
              key={a.id}
              onClick={() => actions.openStudent(a.student.id)}
            >
              <span
                className={`priority-dot ${a.type === "Attendance" ? "red-dot" : ""}`}
              />
              <span>
                <strong>
                  {a.type === "Attendance"
                    ? "Attendance check-in"
                    : "Fee follow-up"}
                </strong>
                <p>{a.student.Name}</p>
                <small>{a.detail}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!flags.length && (
            <Empty
              title="All caught up"
              text="No attendance or fee follow-ups right now."
            />
          )}
          <button
            className="full-text-button"
            onClick={() => actions.navigate("followups")}
          >
            Open follow-up queue <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
function Stat({ title, value, detail, icon: Icon, tone }) {
  return (
    <section className="stat">
      <div className="stat-top">
        <span>{title}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function PanelTitle({ title, sub, right }) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </div>
  );
}
function SearchBox({ value, onChange, placeholder = "Search records…" }) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Admissions({ data, query, setQuery, actions }) {
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState("");
  const leads = rows(data, "Leads").filter(
    (r) =>
      `${r.Last_Name} ${r.Parent_Name} ${r.Email}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status || r.Admission_Status === status),
  );
  return (
    <>
      <div className="pipeline">
        {["New", "Contacted", "Visit Scheduled", "Confirmed", "Rejected"].map(
          (stage, i) => (
            <button
              className={status === stage ? "selected" : ""}
              key={stage}
              onClick={() => setStatus(status === stage ? "" : stage)}
            >
              <span>
                <i className={`stage-dot stage-${i}`} />
                {stage}
              </span>
              <strong>
                {
                  rows(data, "Leads").filter(
                    (r) => r.Admission_Status === stage,
                  ).length
                }
              </strong>
            </button>
          ),
        )}
      </div>
      <section className="panel">
        {error && <div className="error-banner">{error}</div>}
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search child, parent, or email…"
          />
          <a
            className="secondary"
            href="#apply"
            target="_blank"
            rel="noreferrer"
          >
            Admission form <ExternalLink size={15} />
          </a>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Prospective student</th>
                <th>Parent / guardian</th>
                <th>Section</th>
                <th>Next follow-up</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.Last_Name}</strong>
                    <small>{dateLabel(l.Date_of_Birth)}</small>
                  </td>
                  <td>
                    {l.Parent_Name}
                    <small>{l.Email}</small>
                  </td>
                  <td>{label(data, "Sections", l.Desired_Section)}</td>
                  <td>{dateLabel(l.Follow_Up_Date)}</td>
                  <td>
                    <Badge>{l.Admission_Status}</Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      {l.Admission_Status !== "Confirmed" && (
                        <button
                          onClick={() =>
                            actions.setModal({ module: "Leads", record: l })
                          }
                        >
                          Edit
                        </button>
                      )}
                      {!["Confirmed", "Rejected"].includes(
                        l.Admission_Status,
                      ) && (
                        <button
                          disabled={!!confirming}
                          onClick={async () => {
                            setConfirming(l.id);
                            setError("");
                            try {
                              await actions.mutate(
                                `/admissions/${l.id}/confirm`,
                                {},
                                "Admission confirmed; student, enrollment, and parent link created",
                              );
                            } catch (e) {
                              setError(e.message);
                            } finally {
                              setConfirming("");
                            }
                          }}
                        >
                          {confirming === l.id
                            ? "Confirming…"
                            : "Confirm admission"}
                        </button>
                      )}
                      {l.Admission_Status === "Confirmed" && (
                        <button
                          onClick={() => actions.openStudent(ref(l.Student))}
                        >
                          View student
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!leads.length && <Empty title="No matching enquiries" />}
        <div className="table-footer">
          {leads.length} enquiries · Confirming an admission creates linked
          school records.
        </div>
      </section>
    </>
  );
}
function Students({ data, query, setQuery, actions }) {
  const [section, setSection] = useState("");
  const students = rows(data, "Students").filter(
    (s) =>
      `${s.Name} ${s.Student_ID}`.toLowerCase().includes(query.toLowerCase()) &&
      (!section ||
        rows(data, "Enrollments").some(
          (e) =>
            ref(e.Student) === s.id &&
            ref(e.Section) === section &&
            e.Status === "Active",
        )),
  );
  return (
    <section className="panel">
      <div className="table-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search name or student ID…"
        />
        <div className="toolbar-right">
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            aria-label="Filter students by section"
          >
            <option value="">All sections</option>
            {rows(data, "Sections").map((s) => (
              <option key={s.id} value={s.id}>
                {s.Name}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={() =>
              exportCSV(
                students,
                [
                  { key: "Student_ID", label: "Student ID" },
                  { key: "Name", label: "Name" },
                  { key: "Status", label: "Status" },
                ],
                "students",
              )
            }
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Current section</th>
              <th>Birth date</th>
              <th>Attendance</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const e = rows(data, "Enrollments").find(
                (e) => ref(e.Student) === s.id && e.Status === "Active",
              );
              return (
                <tr
                  key={s.id}
                  className="clickable"
                  onClick={() => actions.openStudent(s.id)}
                >
                  <td>
                    <div className="person">
                      <Avatar name={s.Name} />
                      <div>
                        <strong>{s.Name}</strong>
                        <small>{s.Student_ID}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {e ? label(data, "Sections", e.Section) : "Not enrolled"}
                  </td>
                  <td>{dateLabel(s.Date_of_Birth)}</td>
                  <td>
                    <Percent
                      value={
                        attendance(
                          rows(data, "Attendance").filter(
                            (a) => ref(a.Enrollment) === e?.id,
                          ),
                        ).percentage
                      }
                    />
                  </td>
                  <td>
                    <Badge>{s.Status}</Badge>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${s.Name}`}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!students.length && <Empty title="No matching students" />}
      <div className="table-footer">
        {students.length} students · Select a student to view their complete
        history.
      </div>
    </section>
  );
}
function ExamSummary({ data }) {
  return (
    <section className="panel exam-summary">
      <PanelTitle
        title="Class performance"
        sub="Weighted by maximum marks across recorded results"
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Examination</th>
              <th>Section</th>
              <th>Students graded</th>
              <th>Weighted score</th>
              <th>Papers below pass mark</th>
            </tr>
          </thead>
          <tbody>
            {rows(data, "Exams").map((exam) => {
              const papers = new Set(
                rows(data, "Exam_Papers")
                  .filter((p) => ref(p.Exam) === exam.id)
                  .map((p) => p.id),
              );
              const results = rows(data, "Results").filter((r) =>
                papers.has(ref(r.Exam_Paper)),
              );
              return (
                <tr key={exam.id}>
                  <td>
                    {exam.Name}
                    <small>{dateLabel(exam.Exam_Date)}</small>
                  </td>
                  <td>{label(data, "Sections", exam.Section)}</td>
                  <td>{new Set(results.map((r) => ref(r.Enrollment))).size}</td>
                  <td>
                    <Percent value={performance(data, results)} />
                  </td>
                  <td>
                    {
                      results.filter(
                        (r) =>
                          r.Marks <
                          lookup(data, "Exam_Papers", r.Exam_Paper).Pass_Marks,
                      ).length
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows(data, "Exams").length && <Empty title="No examinations yet" />}
    </section>
  );
}
function ResourceTabs({ data, modules, actions }) {
  const [active, setActive] = useState(modules[0]);
  return (
    <>
      <div className="tabs">
        {modules.map((m) => (
          <button
            className={active === m ? "active" : ""}
            key={m}
            onClick={() => setActive(m)}
          >
            {schema.find((s) => s.key === m).label}
            <span>{rows(data, m).length}</span>
          </button>
        ))}
      </div>
      <ResourceTable data={data} module={active} actions={actions} />
    </>
  );
}
function ResourceTable({ data, module, actions, records, readOnly = false }) {
  const [query, setQuery] = useState("");
  const spec = schema.find((m) => m.key === module);
  const fields = spec.fields.filter(
    (f) => !["Unique_Key", "Admission_Key"].includes(f.key),
  );
  const display = (r, f) =>
    f.type === "lookup"
      ? label(data, f.ref, r[f.key])
      : f.type === "money"
        ? money(r[f.key])
        : f.type === "date"
          ? dateLabel(r[f.key])
          : String(r[f.key] ?? "—");
  const filtered = (records || rows(data, module)).filter((r) =>
    fields.some((f) =>
      display(r, f).toLowerCase().includes(query.toLowerCase()),
    ),
  );
  return (
    <section className="panel">
      <div className="table-toolbar">
        <SearchBox value={query} onChange={setQuery} />
        <div className="toolbar-right">
          <button
            className="secondary"
            onClick={() =>
              exportCSV(
                filtered,
                fields.map((f) => ({
                  label: f.label,
                  get: (r) => display(r, f),
                })),
                module,
              )
            }
          >
            <Download size={15} />
            Export
          </button>
          {!readOnly && (
            <button
              className="secondary"
              onClick={() => actions.create(module)}
            >
              <Plus size={15} />
              Add {spec.singular.toLowerCase()}
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              {!readOnly && ["Results", "Parent_Links"].includes(module) && (
                <th>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                {fields.map((f) => (
                  <td key={f.key}>
                    {["Status", "Grade"].includes(f.key) ? (
                      <Badge>{display(r, f)}</Badge>
                    ) : (
                      display(r, f)
                    )}
                  </td>
                ))}
                {!readOnly && ["Results", "Parent_Links"].includes(module) && (
                  <td>
                    <button
                      className="text-button"
                      onClick={() => actions.setModal({ module, record: r })}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <Empty />}
      <div className="table-footer">{filtered.length} records</div>
    </section>
  );
}
function AttendancePage({ data, today, actions }) {
  const [section, setSection] = useState(""),
    [date, setDate] = useState("");
  const records = rows(data, "Attendance")
    .filter(
      (a) =>
        (!date || a.Attendance_Date === date) &&
        (!section ||
          ref(lookup(data, "Enrollments", a.Enrollment).Section) === section),
    )
    .sort((a, b) => b.Attendance_Date.localeCompare(a.Attendance_Date));
  const stats = attendance(records);
  return (
    <>
      <div className="stat-grid three">
        <Stat
          title="Present or late"
          value={stats.present}
          detail="Late counts as attended"
          icon={Check}
          tone="sage"
        />
        <Stat
          title="Absent"
          value={records.filter((a) => a.Status === "Absent").length}
          detail="Excused days excluded from rate"
          icon={Users}
          tone="peach"
        />
        <Stat
          title="Attendance rate"
          value={stats.percentage === null ? "—" : `${stats.percentage}%`}
          detail="Based on the current filters"
          icon={CalendarCheck}
          tone="lavender"
        />
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <h3>Attendance register</h3>
          <div className="toolbar-right">
            <input
              type="date"
              aria-label="Filter by date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
            <select
              aria-label="Filter by section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">All sections</option>
              {rows(data, "Sections").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.Name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Section</th>
                <th>Date</th>
                <th>Status</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const e = lookup(data, "Enrollments", r.Enrollment);
                return (
                  <tr key={r.id}>
                    <td>{label(data, "Students", e.Student)}</td>
                    <td>{label(data, "Sections", e.Section)}</td>
                    <td>{dateLabel(r.Attendance_Date)}</td>
                    <td>
                      <Badge>{r.Status}</Badge>
                    </td>
                    <td>{r.Notes || "—"}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          actions.setModal({ module: "Attendance", record: r })
                        }
                      >
                        Correct
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!records.length && <Empty title="No attendance for these filters" />}
        <div className="table-footer">
          {records.length} records · One entry per student enrollment per date.
        </div>
      </section>
    </>
  );
}
function Fees({ data, today, actions }) {
  const [tab, setTab] = useState("assessments"),
    [onlyDue, setOnlyDue] = useState(false);
  const fees = rows(data, "Fee_Assessments"),
    summary = fees.reduce(
      (sum, f) => {
        const s = feeSummary(data, f, today);
        return {
          total: sum.total + Number(f.Amount),
          collected: sum.collected + s.collected,
          due: sum.due + s.outstanding,
        };
      },
      { total: 0, collected: 0, due: 0 },
    );
  return (
    <>
      <div className="stat-grid three">
        <Stat
          title="Total assessed"
          value={money(summary.total)}
          detail="All academic years"
          icon={Wallet}
          tone="sage"
        />
        <Stat
          title="Amount collected"
          value={money(summary.collected)}
          detail="From the payment ledger"
          icon={Check}
          tone="lavender"
        />
        <Stat
          title="Outstanding balance"
          value={money(summary.due)}
          detail="Credits stay on their assessment"
          icon={Bell}
          tone="peach"
        />
      </div>
      <div className="tabs">
        <button
          className={tab === "assessments" ? "active" : ""}
          onClick={() => setTab("assessments")}
        >
          Fee assessments
        </button>
        <button
          className={tab === "payments" ? "active" : ""}
          onClick={() => setTab("payments")}
        >
          Payment history
        </button>
      </div>
      {tab === "payments" ? (
        <ResourceTable data={data} module="Payments" actions={actions} />
      ) : (
        <section className="panel">
          <div className="table-toolbar">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyDue}
                onChange={(e) => setOnlyDue(e.target.checked)}
              />
              Outstanding only
            </label>
            <button
              className="secondary"
              onClick={() => actions.create("Fee_Assessments")}
            >
              <Plus size={15} />
              Assess a fee
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Student / fee</th>
                  <th>Total</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fees
                  .filter(
                    (f) =>
                      !onlyDue || feeSummary(data, f, today).outstanding > 0,
                  )
                  .map((f) => {
                    const s = feeSummary(data, f, today);
                    const e = lookup(data, "Enrollments", f.Enrollment);
                    return (
                      <tr key={f.id}>
                        <td>
                          <strong>{label(data, "Students", e.Student)}</strong>
                          <small>{f.Name}</small>
                        </td>
                        <td>{money(f.Amount)}</td>
                        <td>
                          {money(s.collected)}
                          {s.credit > 0 && (
                            <small>Credit: {money(s.credit)}</small>
                          )}
                        </td>
                        <td className={s.outstanding ? "due-amount" : ""}>
                          {money(s.outstanding)}
                        </td>
                        <td>{dateLabel(f.Due_Date)}</td>
                        <td>
                          <Badge>{s.status}</Badge>
                        </td>
                        <td>
                          {s.outstanding > 0 && (
                            <button
                              className="text-button"
                              onClick={() =>
                                actions.create("Payments", {
                                  Fee_Assessment: f.id,
                                  Amount: s.outstanding,
                                })
                              }
                            >
                              Record payment
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!fees.length && <Empty />}
          <div className="table-footer">
            Payments are an immutable ledger. References must be unique.
          </div>
        </section>
      )}
    </>
  );
}
function Followups({ data, today, threshold, actions }) {
  const list = alerts(data, today, threshold);
  return (
    <>
      <div className="info-banner">
        <Bell size={20} />
        <div>
          <strong>Early support, before small issues grow.</strong>
          <p>
            Attendance below {threshold}% over up to 30 recent recorded days
            (minimum 5), plus overdue fee balances. This queue recalculates when
            you refresh; no messages are sent automatically.
          </p>
        </div>
      </div>
      <section className="panel">
        <PanelTitle
          title="Your follow-up queue"
          sub={`${list.length} current priorities`}
        />
        {list.map((a) => (
          <div className="followup-row" key={a.id}>
            <Avatar name={a.student.Name} />
            <div>
              <strong>{a.student.Name}</strong>
              <small>
                {a.type} · {a.detail}
              </small>
              <p>{a.action}</p>
            </div>
            <Badge>{a.priority}</Badge>
            <button
              className="secondary"
              onClick={() => actions.openStudent(a.student.id)}
            >
              View student <ArrowRight size={15} />
            </button>
          </div>
        ))}
        {!list.length && (
          <Empty
            title="All caught up"
            text="No students currently meet the follow-up criteria."
          />
        )}
      </section>
    </>
  );
}

function StudentDetail({
  data,
  studentID,
  today,
  actions,
  onBack,
  parent = false,
}) {
  const student = lookup(data, "Students", studentID),
    enrollments = rows(data, "Enrollments").filter(
      (e) => ref(e.Student) === studentID,
    ),
    [chosen, setChosen] = useState(""),
    [tab, setTab] = useState("overview"),
    [promotion, setPromotion] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const current =
    enrollments.find((e) => e.id === chosen) ||
    enrollments.find((e) => e.Status === "Active") ||
    enrollments[0];
  const records = rows(data, "Attendance").filter(
      (a) => ref(a.Enrollment) === current?.id,
    ),
    results = rows(data, "Results").filter(
      (r) => ref(r.Enrollment) === current?.id,
    ),
    fees = rows(data, "Fee_Assessments").filter(
      (f) => ref(f.Enrollment) === current?.id,
    ),
    payments = rows(data, "Payments").filter((p) =>
      fees.some((f) => f.id === ref(p.Fee_Assessment)),
    ),
    rate = attendance(records),
    average = performance(data, results),
    due = fees.reduce((n, f) => n + feeSummary(data, f, today).outstanding, 0);
  return (
    <>
      {onBack && (
        <button className="text-button back-button" onClick={onBack}>
          ← Back to students
        </button>
      )}
      <div className="student-profile">
        <Avatar name={student.Name} />
        <div>
          <h2>{student.Name}</h2>
          <p>
            {student.Student_ID} <span>·</span> Born{" "}
            {dateLabel(student.Date_of_Birth)}
          </p>
        </div>
        <Badge>{student.Status}</Badge>
        <select
          aria-label="Academic enrollment"
          value={current?.id || ""}
          onChange={(e) => setChosen(e.target.value)}
        >
          {enrollments.map((e) => (
            <option key={e.id} value={e.id}>
              {label(data, "Academic_Years", e.Academic_Year)} ·{" "}
              {label(data, "Sections", e.Section)} ({e.Status})
            </option>
          ))}
        </select>
      </div>
      <div className="stat-grid three">
        <Stat
          title="Attendance"
          value={rate.percentage === null ? "—" : `${rate.percentage}%`}
          detail={`${rate.present} of ${rate.total} recorded days attended`}
          icon={CalendarCheck}
          tone="sage"
        />
        <Stat
          title="Academic performance"
          value={average === null ? "—" : `${average}%`}
          detail="Weighted by maximum paper marks"
          icon={GraduationCap}
          tone="lavender"
        />
        <Stat
          title="Fees outstanding"
          value={money(due)}
          detail="For the selected enrollment"
          icon={Wallet}
          tone="peach"
        />
      </div>
      <div className="tabs">
        {["overview", "attendance", "results", "fees", "payments"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === "payments"
              ? "Payment history"
              : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="detail-grid">
          <section className="panel">
            <PanelTitle
              title="Academic journey"
              sub="Every academic year stays in the record"
            />
            <div className="journey">
              {enrollments.map((e) => (
                <div key={e.id}>
                  <i />
                  <div>
                    <strong>
                      {label(data, "Academic_Years", e.Academic_Year)}
                    </strong>
                    <p>
                      {label(data, "Sections", e.Section)} · Since{" "}
                      {dateLabel(e.Start_Date)}
                    </p>
                    <Badge>{e.Status}</Badge>
                  </div>
                </div>
              ))}
              {!enrollments.length && <Empty title="Not enrolled yet" />}
            </div>
          </section>
          <section className="panel">
            <PanelTitle
              title={
                parent
                  ? "Your connection to school"
                  : "Parent & guardian access"
              }
              sub={
                parent
                  ? "School information, connected to your child"
                  : "Only these linked parents can access this student"
              }
            />
            <div className="panel-body">
              {parent ? (
                <p>
                  This view includes only your linked children. Contact the
                  school office for corrections to personal details, attendance,
                  or payments.
                </p>
              ) : (
                rows(data, "Parent_Links")
                  .filter((l) => ref(l.Student) === studentID)
                  .map((l) => (
                    <div className="guardian" key={l.id}>
                      <Mail size={18} />
                      <div>
                        <strong>{l.Name}</strong>
                        <p>{l.Parent_Email}</p>
                        <Badge>{l.Status}</Badge>
                      </div>
                    </div>
                  ))
              )}
              {!parent && (
                <button
                  className="secondary"
                  onClick={() =>
                    actions.create("Parent_Links", { Student: studentID })
                  }
                >
                  <Plus size={15} />
                  Link a parent
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {tab === "attendance" && (
        <ResourceTable
          data={data}
          module="Attendance"
          records={records}
          readOnly
        />
      )}
      {tab === "results" && (
        <ResourceTable
          data={data}
          module="Results"
          records={results}
          readOnly
        />
      )}
      {tab === "payments" && (
        <ResourceTable
          data={data}
          module="Payments"
          records={payments}
          readOnly
        />
      )}
      {tab === "fees" && (
        <section className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fee</th>
                <th>Total</th>
                <th>Collected</th>
                <th>Outstanding</th>
                <th>Credit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => {
                const s = feeSummary(data, f, today);
                return (
                  <tr key={f.id}>
                    <td>
                      {f.Name}
                      <small>Due {dateLabel(f.Due_Date)}</small>
                    </td>
                    <td>{money(f.Amount)}</td>
                    <td>{money(s.collected)}</td>
                    <td>{money(s.outstanding)}</td>
                    <td>{money(s.credit)}</td>
                    <td>
                      <Badge>{s.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!fees.length && <Empty title="No fees assessed" />}
        </section>
      )}
      {!parent && current && (
        <section className="panel promotion">
          <div>
            <h3>Continue the academic journey</h3>
            <p>
              Promotion adds a new enrollment and preserves all previous
              records.
            </p>
          </div>
          <select
            aria-label="Promotion section"
            value={promotion}
            onChange={(e) => setPromotion(e.target.value)}
          >
            <option value="">Select next year’s section</option>
            {rows(data, "Sections")
              .filter(
                (s) =>
                  lookup(data, "Academic_Years", s.Academic_Year).Start_Date >
                  lookup(data, "Academic_Years", current.Academic_Year)
                    .End_Date,
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.Name}
                </option>
              ))}
          </select>
          <button
            className="secondary"
            disabled={!promotion || working}
            onClick={async () => {
              setWorking(true);
              setError("");
              try {
                await actions.mutate(
                  `/enrollments/${current.id}/promote`,
                  { section: promotion },
                  "Promotion complete; academic history preserved",
                );
                setPromotion("");
              } catch (e) {
                setError(e.message);
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? "Promoting…" : "Promote student"}
          </button>
          {error && <p className="field-error">{error}</p>}
        </section>
      )}
    </>
  );
}
function ParentPortal({ data, today }) {
  const children = rows(data, "Students"),
    [id, setID] = useState("");
  const selected = children.find((c) => c.id === id) || children[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            A closer connection to their school day.
          </div>
          <h1>Your child’s journey</h1>
        </div>
        <div className="heading-actions">
          <ShieldCheck size={18} />
          <span>Private parent access</span>
        </div>
      </div>
      {children.length > 1 && (
        <div className="tabs">
          {children.map((c) => (
            <button
              className={selected?.id === c.id ? "active" : ""}
              key={c.id}
              onClick={() => setID(c.id)}
            >
              {c.Name}
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <StudentDetail
          key={selected.id}
          data={data}
          studentID={selected.id}
          today={today}
          parent
        />
      ) : (
        <Empty
          title="No linked children"
          text="Ask the school administrator to connect your parent account."
        />
      )}
    </>
  );
}
function SettingsPage({ meta, user }) {
  return (
    <div className="settings-grid">
      <section className="panel">
        <PanelTitle title="School workspace" />
        <dl className="settings-list">
          <dt>School</dt>
          <dd>{meta?.school}</dd>
          <dt>Data source</dt>
          <dd>
            {meta?.mode === "zoho"
              ? "Zoho CRM · live"
              : "Local demo · JSON storage"}
          </dd>
          <dt>Staff account</dt>
          <dd>{user.email}</dd>
          <dt>Parent portal</dt>
          <dd>
            {meta?.mode === "zoho"
              ? "Deploy the supplied Zoho Creator application scripts"
              : "Use the parent demo to preview restricted access"}
          </dd>
        </dl>
      </section>
      <section className="panel">
        <PanelTitle
          title="Connect your Zoho account"
          sub="Credentials stay on the server"
        />
        <div className="panel-body">
          <ol className="setup-list">
            <li>Create a Zoho One trial and configure the CRM schema.</li>
            <li>
              Set your client ID, client secret, and refresh token in the root{" "}
              <code>.env</code>.
            </li>
            <li>
              Set <code>APP_MODE=zoho</code> and restart the API.
            </li>
            <li>Deploy the Deluge workflows and Creator parent page.</li>
          </ol>
          <p>
            See <code>docs/zoho-deployment.md</code> and{" "}
            <code>docs/credentials.md</code> in the project for the exact setup
            steps.
          </p>
        </div>
      </section>
    </div>
  );
}

function optionLabel(data, module, r) {
  if (module === "Fee_Assessments") {
    const enrollment = lookup(data, "Enrollments", r.Enrollment);
    return (
      label(data, "Students", enrollment.Student) +
      " · " +
      r.Name +
      " · " +
      money(r.Amount)
    );
  }
  if (module === "Sections")
    return r.Name + " · " + label(data, "Academic_Years", r.Academic_Year);
  if (module === "Exams")
    return r.Name + " · " + label(data, "Sections", r.Section);
  if (module === "Students") return r.Name + " · " + r.Student_ID;
  return r.Name || r.Last_Name || r.id;
}
function RecordModal({ modal, data, today, onClose, onSave }) {
  const spec = schema.find((m) => m.key === modal.module),
    editing = !!modal.record;
  const editable = {
    Leads: [
      "Last_Name",
      "Parent_Name",
      "Email",
      "Phone",
      "Date_of_Birth",
      "Requested_Class",
      "Desired_Section",
      "Admission_Status",
      "Follow_Up_Date",
      "Notes",
    ],
    Students: ["Name", "Status"],
    Attendance: ["Status", "Notes"],
    Results: ["Marks"],
    Parent_Links: ["Status"],
  };
  const fields = spec.fields.filter(
    (f) =>
      !f.readonly &&
      (!editing || editable[modal.module]?.includes(f.key)) &&
      !(
        f.key === "Name" &&
        [
          "Attendance",
          "Results",
          "Payments",
          "Enrollments",
          "Teaching_Assignments",
        ].includes(modal.module)
      ),
  );
  const [values, setValues] = useState(() =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          ref(
            modal.record?.[f.key] ??
              modal.defaults?.[f.key] ??
              (f.type === "picklist"
                ? f.options[0]
                : f.type === "date" &&
                    !["Date_of_Birth", "End_Date", "Follow_Up_Date"].includes(
                      f.key,
                    )
                  ? today
                  : ""),
          ),
        ]),
      ),
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = Object.fromEntries(
        fields
          .filter(
            (f) =>
              values[f.key] !== "" || !["number", "money"].includes(f.type),
          )
          .map((f) => [
            f.key,
            ["number", "money"].includes(f.type)
              ? Number(values[f.key])
              : values[f.key],
          ]),
      );
      await onSave(input);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="record-dialog"
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">SCHOOL RECORDS</div>
            <h2>
              {editing ? "Edit" : "Add"} {spec.singular.toLowerCase()}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.key}
              className={f.type === "textarea" ? "full-width" : ""}
            >
              {f.label}
              {f.required && <span className="required"> *</span>}
              {f.type === "lookup" || f.type === "picklist" ? (
                <select
                  required={f.required}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                >
                  <option value="">Select {f.label.toLowerCase()}</option>
                  {f.type === "lookup"
                    ? rows(data, f.ref).map((r) => (
                        <option key={r.id} value={r.id}>
                          {optionLabel(data, f.ref, r)}
                        </option>
                      ))
                    : f.options
                        .filter((o) => o !== "Confirmed")
                        .map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  required={f.required}
                  type={
                    ["number", "money"].includes(f.type)
                      ? "number"
                      : f.type === "phone"
                        ? "tel"
                        : f.type === "date"
                          ? "date"
                          : f.type === "email"
                            ? "email"
                            : "text"
                  }
                  min={
                    ["number", "money"].includes(f.type)
                      ? f.type === "money"
                        ? "0.01"
                        : "0"
                      : undefined
                  }
                  max={
                    [
                      "Attendance_Date",
                      "Payment_Date",
                      "Date_of_Birth",
                    ].includes(f.key)
                      ? today
                      : undefined
                  }
                  step={
                    ["number", "money"].includes(f.type) ? "0.01" : undefined
                  }
                  maxLength={255}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
        </div>
        <div className="dialog-footer">
          <p>
            <ShieldCheck size={14} />
            Validated before saving
          </p>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save record"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
function Login({ meta, error: externalError, onLogin, onApply }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function signIn(demoRole) {
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api(demoRole ? "/demo-login" : "/login", {
          method: "POST",
          body: demoRole ? { role: demoRole } : { email, password },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <School size={25} />
          </span>
          schooldesk.
        </div>
        <div>
          <span className="banner-tag">A LITTLE MORE CONNECTED</span>
          <h1>
            Good school days
            <br />
            start with
            <br />
            <em>better connections.</em>
          </h1>
          <p>
            A home for your school’s people, progress,
            <br />
            and possibilities.
          </p>
          <div className="story-line" />
          <span className="school-sign">
            {meta?.school || "Greenfield Academy"}
          </span>
        </div>
        <small>From first enquiries to brighter futures.</small>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <span className="eyebrow">YOUR SCHOOL, TOGETHER</span>
          <h2>Welcome to Schooldesk</h2>
          <p>Sign in to your school workspace.</p>
          {(error || externalError) && (
            <div className="error-banner" role="alert">
              {error || externalError}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
          >
            <label>
              Email address
              <input
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.edu"
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          {meta?.mode === "demo" && (
            <div className="demo-options">
              <span>EXPLORE THE LOCAL DEMO</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => signIn("staff")}
              >
                <School size={17} />
                Staff workspace
                <ArrowRight size={16} />
              </button>
              <div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => signIn("parent")}
                >
                  Sharma parent
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => signIn("other-parent")}
                >
                  Patel parent
                </button>
              </div>
              <small>
                Synthetic records. Each parent sees only their own children.
              </small>
            </div>
          )}
          <div className="login-apply">
            New to our school?{" "}
            <button onClick={onApply}>
              Enquire about admission <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <span className="login-foot">
          <ShieldCheck size={15} />A private space for your school community.
        </span>
      </section>
    </div>
  );
}
function AdmissionPage({ meta, api, onBack }) {
  const [values, setValues] = useState({
      Last_Name: "",
      Parent_Name: "",
      Email: "",
      Phone: "",
      Date_of_Birth: "",
      Desired_Section: "",
      Notes: "",
    }),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="admission-public">
      <div className="public-top">
        <div className="brand">
          <span className="brand-icon">
            <School size={23} />
          </span>
          schooldesk.
        </div>
        <button className="text-button" onClick={onBack}>
          Back to sign in <ArrowRight size={16} />
        </button>
      </div>
      <div className="public-content">
        <div>
          <div className="eyebrow">{meta?.school || "YOUR NEXT CHAPTER"}</div>
          <h1>
            A bright beginning
            <br />
            starts here.
          </h1>
          <p>
            Tell us a little about your child. Our admissions team will help you
            take the next step.
          </p>
          <div className="public-promise">
            <BookOpen size={24} />
            <div>
              <strong>Room to learn. Space to grow.</strong>
              <p>A school community that knows your child.</p>
            </div>
          </div>
        </div>
        <section className="panel public-form">
          {meta?.webformURL && meta.mode === "zoho" ? (
            <iframe title="Zoho CRM admission webform" src={meta.webformURL} />
          ) : sent ? (
            <div className="success-state">
              <span className="graphic-check">
                <Check size={30} />
              </span>
              <h2>Your next chapter is on its way.</h2>
              <p>
                Your enquiry has been received. Our admissions team will follow
                up with you.
              </p>
              <button className="primary" onClick={onBack}>
                Back to Schooldesk
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("/admissions", { method: "POST", body: values });
                  setSent(true);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>Admission enquiry</h2>
              <p>
                {meta?.mode === "demo"
                  ? "Local demo form · enquiries appear in Admissions."
                  : "Your enquiry will be recorded in Zoho CRM."}
              </p>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <div className="form-grid">
                {[
                  { k: "Last_Name", l: "Child’s full name" },
                  { k: "Date_of_Birth", l: "Date of birth", t: "date" },
                  { k: "Parent_Name", l: "Parent / guardian name" },
                  { k: "Email", l: "Email address", t: "email" },
                  { k: "Phone", l: "Phone number", t: "tel" },
                ].map((f) => (
                  <label key={f.k}>
                    {f.l}
                    <input
                      required={f.k !== "Phone"}
                      type={f.t || "text"}
                      maxLength={255}
                      value={values[f.k]}
                      onChange={(e) =>
                        setValues({ ...values, [f.k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  Requested section
                  <select
                    required
                    value={values.Desired_Section}
                    onChange={(e) =>
                      setValues({ ...values, Desired_Section: e.target.value })
                    }
                  >
                    <option value="">Select section</option>
                    {meta?.sections?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.Name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full-width">
                  Anything you’d like us to know?
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={values.Notes}
                    onChange={(e) =>
                      setValues({ ...values, Notes: e.target.value })
                    }
                  />
                </label>
              </div>
              <button className="primary" disabled={busy}>
                {busy ? "Submitting…" : "Send enquiry"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
