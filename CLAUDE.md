# CLAUDE.md

DU Job Portal: a recruitment portal for Daanish University, built for a competition. It is a personal project, not a Codedevza repo, so the Codedevza Team Kit (intake form, Done checklist, design-review passes, branch rules) does not apply here.

## Read first

- [SRS.pdf](SRS.pdf): the requirements. Functional requirements are numbered A1 to I10; refer to them by ID in code comments, commits and PRs. The demo scenario at the end is what the judges will walk through, so it sets the priority.
- [README.md](README.md): what the portal covers, setup, the database migration workflow, repo layout, stack and commands. Keep it current when setup or scripts change.
- [THEME.md](THEME.md): colours, fonts, buttons, cards, forms, focus, layout and motion, taken from du.edu.pk. Every screen follows it. Use its tokens only; if a screen needs something it doesn't cover, decide, then add it to THEME.md in the same change.
- [portal/AGENTS.md](portal/AGENTS.md): this is Next.js 16, which differs from older versions. Check the guides in `portal/node_modules/next/dist/docs/` before writing routing, data fetching, caching or config code. `cacheComponents` is off on purpose: pages read cookies and the database on every request.

## Layout

- Everything lives in one Next.js app in `portal/` (App Router, `src/` directory, TypeScript, Tailwind 4).
- Root holds only the docs: `SRS.pdf`, `README.md`, `THEME.md`, `CLAUDE.md`.
- `src/components/` is the only place for components: `ui/` for primitives (Button, Card, Field, ActionForm, SubmitButton, ConfirmButton, Table, Badge, Notice, PageHeader, TabNav, StageTracker), `layout/` for shells, and one folder per area. Pages hold no component definitions beyond small local helpers.
- `src/actions/<area>.ts` for server actions, `src/lib/` for domain logic. `src/lib/db/schema.ts` is the single schema.
- Database: Postgres on Neon (project `du-job-portal`, branches `main` for production and `dev` for local). Every schema change is a migration in `portal/migrations/` made with `npm run db:generate`; never change the database by hand or with `drizzle-kit push`. Production deploys run pending migrations first.
- Uploaded files are stored in Postgres (`document_files`), not on disk: Vercel's filesystem doesn't persist. Uploads are capped at 4 MB because Vercel limits request bodies to 4.5 MB.
- Logo: `portal/public/du-logo.png`. Deployed on Vercel (project `du-job-portal`, region `sin1`).

## Commands

Run from `portal/`:

- `npm run dev`: dev server on http://localhost:3000 (reads `.env.local`)
- `npm run db:generate`, `npm run db:migrate`: schema changes
- `npm run db:bootstrap`: templates, settings and the first super admin on a fresh database
- `npm run lint`, `npm run typecheck`, `npm run build`

Before calling work done: lint, typecheck and build pass. Run `npx next typegen` after adding routes so `PageProps<"/route">` types exist.

## Conventions

- Copy in plain English and sentence case. Never use an em dash or en dash anywhere: copy, code, comments or docs.
- No text smaller than 14 px (`text-sm`); body 16 px. No fonts beyond Inter and Playfair Display, no icon set beyond Lucide, no UI libraries.
- Every screen works at 375 px wide: forms stack, tables scroll sideways, buttons wrap.
- Every form uses `ActionForm` with a server action that returns `done()` or `fail()` from `src/lib/action-state.ts`. Destructive steps use `ConfirmButton`.
- Every database call is async and must be awaited. ESLint enforces it (`no-floating-promises` with `checkThenables`, `no-misused-promises`): a Drizzle query that isn't awaited never runs, and an async callback in `.some()` or `.filter()` always counts as true.
- Every server action re-checks the user (`assertUser(roles)`) and their access (`canManagePosition`, `canViewApplication`), validates input, calls `audit()`, and revalidates what it changed. The audit log is append-only (database triggers).
- Candidates never see internal notes, scores or panel comments. Panel members see only their assigned, non-conflicted candidates (`panelApplicationIds`).
- Times are stored as UTC ISO strings and shown in PKT, plus the candidate's own zone where it differs (`formatDual`).
- Status changes the candidate sees go through `setApplicationStatus`, which records history and emails them. Stage moves go through `setStage`, which feeds the time-to-hire report.
- No mock or demo data in the database. Test on the Neon `dev` branch, and reset it from `main` afterwards (`neonctl branches reset dev --parent`).
- Git author for this repo is set locally (`TalalMajeed`). Commit or push only when asked.
