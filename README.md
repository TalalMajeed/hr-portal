# DU Job Portal

A web portal for Daanish University (DU) that runs every hire, faculty and administrative, from the approved position to the Selection Board report.

The full requirements are in [SRS.pdf](SRS.pdf). The look follows [THEME.md](THEME.md), taken from du.edu.pk.

## What it covers

Each position moves through ten stages:

1. Position and ToRs: request, budget, approval
2. Job description: criteria and required documents
3. Advertisement: careers page, exported ads, agencies
4. Applications: online form and uploads
5. Shortlisting: screening and expert scores
6. Interview panel: invitations and availability
7. Interview: slots, confirmation, video link
8. Faculty talk or second round
9. Evaluation: scores and panel consensus
10. Selection Board: pack, recommendation, offer

Roles: super admin, Executive Director, HR officer, hiring lead, shortlisting reviewer, panel member, Selection Board member, headhunter or agency, and candidate. External reviewers and panelists work through secure links without full accounts.

Out of scope for now: payroll, onboarding after an offer is accepted, and student admissions.

## Getting started

Requires Node.js 20 or later.

```bash
cd portal
npm install
npm run setup
npm run dev
```

`npm run setup` creates the SQLite database in `portal/data/` and fills it with demo data. Open http://localhost:3000.

### Demo accounts

Every demo account's password is `Demo@1234`. The sign-in page also has one-click buttons for each role.

| Role | Email |
| --- | --- |
| Super admin | admin@demo.du.edu.pk |
| Executive Director | ed@demo.du.edu.pk |
| HR officer | azhar.hr@demo.du.edu.pk |
| Hiring lead | dean.science@demo.du.edu.pk |
| External reviewer | reviewer.ext@example.com (or the secure link on Users and roles) |
| Panel chair | panel.chair@demo.du.edu.pk |
| Selection Board | board.chair@demo.du.edu.pk |
| Agency | careerpakistan@example.com |
| Candidate | ayesha.khan@example.com |

The demo data has positions at different stages: Computer Science at evaluation, Physics decided and filled, Procurement and Economics taking applications, Deputy Registrar waiting for the ED, and Director IT with its job description drafted.

### No mail server

This build stores every email in the portal instead of sending it: HR sees them under Emails and candidates see theirs under Messages. In demo mode the verification, password reset and sign-in code pages show the email that was just sent. Set `DEMO_LOGINS=off` to hide the demo buttons and those previews.

## Repository layout

```
hr-portal/
├── SRS.pdf          Software requirements specification
├── README.md
├── THEME.md         DU colours, fonts and components
├── CLAUDE.md        Notes for Claude Code
└── portal/          Next.js app (front end, server actions and API routes)
    ├── src/app/         Routes: (public) careers and sign-in, (portal) signed-in areas, print, api
    ├── src/actions/     Server actions, one file per area
    ├── src/components/  Every component: ui primitives, layout, and one folder per area
    ├── src/lib/         Database, auth, email, uploads, reports and domain logic
    └── scripts/seed/    Demo data
```

## Stack

- Next.js 16 (App Router, server actions) with React 19 and TypeScript
- Tailwind CSS 4
- SQLite through Drizzle ORM and better-sqlite3
- bcrypt password hashing, zod validation, ExcelJS for exports, Lucide icons

## Scripts

Run these from `portal/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run setup` | Recreate the database with demo data |
| `npm run db:reset` | Same as setup |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint the code |
| `npm run typecheck` | Check types |

## Integrations

| Integration | In this build |
| --- | --- |
| Zoom | Real meetings with the waiting room on when `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` are set; otherwise simulated links. Meet and Teams are simulated. |
| Calendar | Confirmed sessions download as `.ics` invites for Google Calendar and Outlook, updated on reschedule. |
| Email | Stored in the portal; connect DU's mail server to deliver. |
| Reminders | `GET /api/cron/reminders` sends 24-hour and 1-hour reminders; protect it with `CRON_SECRET`. |
| Data import | CSV import of existing candidates under Import. |
| Single sign-on, SMS and WhatsApp | Not in this build. |
