# Schooldesk — Zoho school management assignment

A monorepo containing a React staff/parent demonstration, a Go API with a real Zoho CRM adapter, and the Deluge, CRM schema, validation, and Creator page sources needed for the Zoho implementation.

The [actual assignment](https://docs.google.com/document/d/1YDQwQ_v6mOOggc-moIZ1M9nfSJryjMfIgt3bbexpN90/edit) requires **Zoho CRM + Zoho Creator + Deluge**. React and Go are a companion implementation and runnable demonstration; they do not replace the required Zoho deployment. **No Zoho organization has been configured or tested yet**, because no account or credentials were supplied. The native setup steps and submission checklist below remain necessary before submitting.

## Run locally

Requires Node 22.12+ (tested with Node 24) and Go 1.25+.

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run dev
```

Open **http://localhost:5173**. Select **Staff workspace**, **Sharma parent**, or **Patel parent** to explore the local demo. The Sharma parent sees two children; the Patel parent sees a different child. The admission form is at **http://localhost:5173/#apply**.

On macOS/Linux use `npm` instead of `npm.cmd`. Windows PowerShell installations with script execution disabled should use `npm.cmd`, as above.

`setup` creates a root `.env` with a random staff password and preserves an existing file. All companion secrets are read on the server from that file. The frontend never receives them. Demo sign-in is available only in `APP_MODE=demo`, and that mode refuses to bind to a non-loopback address. Demo records persist in `data/demo.json`; the real Zoho mode does not use that file.

## What is implemented

- Enquiry capture, admission stages, follow-up dates, rejection, and resumable confirmation.
- Student IDs, annual enrollments, academic years, classes, sections, subjects, teachers, and teaching assignments.
- Attendance with unique enrollment/date keys, date validation, corrections, history, and percentages.
- Examinations, subject papers, validated marks, grades, and weighted performance.
- Fee assessments, installments, unique receipt references, overdue balances, credits, and payment history.
- Parent access links with revocation and server-side isolation, including siblings and year selection.
- An early-support queue for low attendance and overdue fees; native Deluge creates/resolves CRM follow-ups.
- Staff reporting, CSV exports, a native CRM report specification, responsive layouts, error states, and loading states.
- Zoho OAuth refresh, paginated CRM reads, typed lookup writes, and record-level error handling.
- Native Creator parent page reads current CRM data under the authenticated Creator identity without copying academic data into Creator.

## Project layout

```text
apps/web/              React + Vite interface and reporting tests
apps/api/              Go HTTP API, validation, demo storage, Zoho adapter and tests
packages/schema/       Shared canonical module/field definitions
scripts/               Local startup, .env setup, OAuth and CRM schema provisioning
zoho/crm/              Deluge buttons, workflows, validations and Client Scripts
zoho/creator/          Private parent portal functions and HTML/Deluge page
docs/                  Account setup, architecture, reports and acceptance checks
```

## Connect Zoho

Read **[credentials](docs/credentials.md)** and **[Zoho deployment](docs/zoho-deployment.md)** in that order. Required companion credentials are `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN`. The accounts/API URLs must match your data center. `ZOHO_PROFILE_ID` is required only for schema provisioning. No MongoDB, Atlas URI, payment gateway, SMTP, or OpenAI key is needed.

```powershell
npm.cmd run zoho:plan       # offline schema plan; does not change an account
npm.cmd run zoho:token      # exchanges your temporary grant; saves refresh token to .env
npm.cmd run zoho:provision  # creates missing CRM modules/fields in your configured org
```

Provisioning deliberately does not pretend to configure Creator permissions, CRM layouts, workflow associations, native reports, or the CRM Webform. Follow the deployment guide for those steps. Review the plan and use an appropriate trial/development organization before running the provisioning command.

After configuration, set `APP_MODE=zoho`, restart, and sign in using `APP_ADMIN_EMAIL` / `APP_ADMIN_PASSWORD`. Native parents sign in through the deployed **Creator portal**; the companion parent demos are disabled in live mode. The companion administrator is a single school-admin account, while native CRM profiles control the actual staff roles.

## Checks

```powershell
go test ./apps/api/...
go vet ./apps/api/...
npm.cmd run test --workspace apps/web
npm.cmd run build --workspace apps/web
go build -o .cache/schooldesk.exe ./apps/api
npm.cmd run test:smoke
```

Verified locally: 15 Go tests, 5 frontend reporting tests, `go vet`, the frontend production build, and an HTTP smoke check against the built app. The tests cover concurrent duplicates, interrupted admissions, immutable payments, promotion history, parent isolation/revocation, CSRF origin checking, and mocked Zoho responses. The smoke check creates isolated temporary data, exercises admission and parent authorization, and stops its own server. Native Deluge compilation and CRM/Creator acceptance tests require your Zoho tenant. Browser visual QA was unavailable in this environment; use [the acceptance guide](docs/acceptance.md) for the remaining UI and live-account checks.

For a single-origin production build, the Go server serves `apps/web/dist`. Set `APP_ORIGIN` to the exact public HTTPS origin, `APP_SECURE_COOKIE=true`, and `APP_MODE=zoho`; terminate HTTPS at a trusted reverse proxy. The supplied Dockerfile supports this live configuration (`docker run --env-file .env -p 8080:8080 ...`, with `APP_ADDR=0.0.0.0:8080`). Container deployment has not been run here.

## Submission

See [requirements and acceptance checks](docs/acceptance.md), [data model](docs/architecture.md), and [report definitions](docs/reports.md). The employer also needs live CRM access, a live Creator parent application, and the CRM-generated Webform. Do not submit just the React demo or put `.env` in a repository. No email has been sent on your behalf.
