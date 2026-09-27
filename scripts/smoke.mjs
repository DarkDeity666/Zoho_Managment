// End-to-end HTTP check against the built Go binary and production web bundle.
// Uses an isolated temporary demo file and port, never the user's normal data.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const binary = resolve(process.platform === 'win32' ? '.cache/schooldesk.exe' : '.cache/schooldesk');
if (!existsSync(binary)) throw new Error(`Build the API first: go build -o ${binary} ./apps/api`);
const temp = mkdtempSync(join(tmpdir(), 'schooldesk-smoke-'));
const port = 18081;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(binary, [], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, APP_MODE: 'demo', APP_ADDR: `127.0.0.1:${port}`, APP_ORIGIN: origin, APP_ADMIN_PASSWORD: 'isolated-test-password-only', DEMO_DATA_FILE: join(temp, 'demo.json') } });
let serverError = '';
server.stderr.on('data', text => { serverError += text.toString(); });
server.on('error', error => { serverError += error.message; });
let cookie = '';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(`${origin}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${method} ${path}: ${await response.clone().text()}`);
  const set = response.headers.get('set-cookie');if (set) cookie = set.split(';')[0];
  return response.json();
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error(serverError || 'API exited early');
    try { const res = await fetch(`${origin}/api/health`);if (res.ok) { ready = true;break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, serverError || 'API did not start');
  const page = await fetch(origin);assert.equal(page.status, 200);assert.match(await page.text(), /Schooldesk/);
  await request('/api/demo-login', 'POST', { role: 'staff' });
  const before = await request('/api/workspace');assert.equal(before.data.Students.length, 8);
  await request('/api/admissions', 'POST', { Last_Name: 'Smoke Test Child', Parent_Name: 'Test Guardian', Email: 'smoke@example.test', Date_of_Birth: '2014-01-02', Desired_Section: 'section-7a' }, 201);
  const afterEnquiry = await request('/api/workspace');const lead = afterEnquiry.data.Leads.find(l => l.Email === 'smoke@example.test');assert.ok(lead);
  const confirmed = await request(`/api/admissions/${lead.id}/confirm`, 'POST', {});assert.equal(confirmed.Admission_Status, 'Confirmed');
  await request(`/api/admissions/${lead.id}/confirm`, 'POST', {});
  const admitted = await request('/api/workspace');assert.equal(admitted.data.Students.length, 9);
  const enrollment = admitted.data.Enrollments.find(e => e.Student === confirmed.Student);assert.ok(enrollment);
  await request('/api/records/Attendance', 'POST', { Enrollment: enrollment.id, Attendance_Date: admitted.today, Status: 'Present' });
  await request('/api/records/Attendance', 'POST', { Enrollment: enrollment.id, Attendance_Date: admitted.today, Status: 'Absent' }, 422);
  await request('/api/logout', 'POST', {});
  await request('/api/demo-login', 'POST', { role: 'parent' });
  const parent = await request('/api/workspace?student_id=student-3');assert.equal(parent.data.Students.length, 2);assert.ok(parent.data.Students.every(s => ['student-1', 'student-2'].includes(s.id)));
  await request('/api/records/Students', 'POST', { Name: 'Not permitted' }, 403);
  console.log('HTTP smoke passed: built web page, staff login, enquiry, idempotent admission, attendance duplicate guard, parent isolation and write denial.');
} finally {
  server.kill();
  // Temporary synthetic data is retained in the OS temp directory for inspection.
}
