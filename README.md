# Enventry — inventory for stores

Multi-tenant store inventory: IN/OUT entries (challans), stock, parties, documents, and a hashed audit trail.

| | |
| --- | --- |
| **GitHub** | [Swati-keshari/Enventry-managment-system-for-stores](https://github.com/Swati-keshari/Enventry-managment-system-for-stores) |
| **Live app** | [enventry-managment-system-for-store.vercel.app](https://enventry-managment-system-for-store.vercel.app) |
| **Default branch** | `main` (push here runs CI and production deploy) |
| **Owner** | [Swati-keshari](https://github.com/Swati-keshari) |

---

## What this GitHub repo is

This repository is the **whole product**: Next.js UI, API routes, Supabase SQL migrations, tests, and GitHub Actions that lint, test, and deploy to Vercel.

```
You (browser)
    → Vercel (this Next.js app)
        → Supabase Auth + PostgreSQL (RLS)
        → Google Drive (documents, after warehouse OAuth)
        → IDrive e2 / S3 (file backup)
        → Upstash Redis (rate limits / cache)
```

Google **sign-in** goes through **Supabase Auth**. **Connect Google Drive** uses the app’s `GOOGLE_CLIENT_ID` on Vercel. Those must be the same Google Cloud web client (**Enventry Web**), or Drive connect fails with `redirect_uri_mismatch`.

---

## GitHub layout

```
.
├── .github/workflows/
│   ├── ci.yml              # lint, typecheck, Vitest, Playwright, build
│   ├── deploy.yml          # push to main → Vercel production + smoke test
│   └── restore-drill.yml   # quarterly (or manual) restore smoke against test DB
├── src/                    # application (App Router)
│   ├── app/(auth)/         # login, signup, forgot/reset password
│   ├── app/(dashboard)/    # entries, items, parties, dashboard, documents, users, audit, super admin
│   ├── app/api/            # REST handlers
│   ├── app/auth/callback/  # Supabase OAuth / session callback
│   ├── app/onboarding/     # first warehouse
│   └── lib/                # auth, RBAC, audit chain, Drive, storage
├── supabase/migrations/    # PostgreSQL schema, RLS, audit functions
├── tests/
│   ├── unit/
│   ├── integration/        # RLS, RBAC, CRUD, audit, dashboard, Drive mocks
│   └── e2e/                # Playwright
└── README.md
```

---

## How GitHub Actions work

### CI (`.github/workflows/ci.yml`)

Runs on **push** and **pull request** to `main`.

1. ESLint + `tsc --noEmit`
2. Vitest unit + integration (needs Supabase **test** secrets)
3. Playwright E2E (skipped if those secrets are missing)
4. `next build`

### Deploy (`.github/workflows/deploy.yml`)

Runs on **push to `main`**.

1. `npx vercel pull` (production env)
2. `npx vercel build --prod`
3. `npx vercel deploy --prebuilt --prod`
4. Smoke: `GET /api/health` and `GET /` on the live URL

Concurrency group `deploy-main` cancels an in-flight deploy if another push lands.

### Restore drill (`.github/workflows/restore-drill.yml`)

Manual (`workflow_dispatch`) or quarterly cron. Re-runs isolation / audit / dashboard tests against the **test** Supabase project.

---

## GitHub secrets and variables

Set these on the repo (Settings → Secrets and variables). Do not commit real keys.

**Repository variables (Deploy)**

| Variable | Role |
| --- | --- |
| `VERCEL_ORG_ID` | Vercel team / org |
| `VERCEL_PROJECT_ID` | Vercel project |

**Repository secrets**

| Secret | Used by |
| --- | --- |
| `VERCEL_TOKEN` | Deploy |
| `SUPABASE_TEST_URL` | CI tests |
| `SUPABASE_TEST_ANON_KEY` | CI tests |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | CI tests |
| `E2E_TEST_EMAIL` | Playwright |
| `E2E_TEST_PASSWORD` | Playwright |

**Vercel production env** (project settings, not GitHub): Supabase URL/keys, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Enventry Web), `DRIVE_ROOT_FOLDER_ID`, S3/IDrive keys, Redis if used.

Drive OAuth redirect that must be on that Google client:

`https://enventry-managment-system-for-store.vercel.app/api/integrations/google-drive/callback`

Also register the Supabase callback: `https://<project-ref>.supabase.co/auth/v1/callback`.

---

## Product

- **Stores (warehouses)** are tenants. RLS keeps data apart.
- **Roles:** Admin, Manager, Staff. Staff only edit their own entries.
- **Super Admin:** email allowlist in `src/lib/super-admin.ts` (`keshariswati511@gmail.com`, `swatikeshari511@gmail.com`). Create/restore stores, platform audit.
- **Entries:** one visit = one challan number, date, direction (IN/OUT), optional party, **one vehicle number**, and **one or more items**. The same vehicle number can be used again when that truck returns.
- **Dashboard:** stock IN/OUT/remaining, date ranges, vehicle visits, alerts, CSV/Excel.
- **Documents:** upload via connected Google Drive.
- **Audit:** SHA-256 hash chain (`append_audit_log` / verify / repair).

### Roles

| Action | Admin | Manager | Staff |
| --- | --- | --- | --- |
| Dashboard | yes | yes | no |
| Entries | yes | yes | own only |
| Items / parties / documents | yes | yes | yes |
| Audit | yes | yes | no |
| Repair audit chain | yes | no | no |
| Invite users | yes | no | no |
| Super Admin UI | allowlisted emails only | no | no |

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth + RLS) · Zod · jsPDF / SheetJS · Google Drive API · S3-compatible storage · Vitest · Playwright · **Vercel** (GitHub Actions deploy).

---

## Database (Supabase)

Migrations live in `supabase/migrations/`. Apply them on the project that production uses.

| Table | Purpose |
| --- | --- |
| `warehouses` | Stores |
| `app_users` | Users in a store + role |
| `items` | Catalog (bag size, unit) |
| `parties` | Buyers / suppliers |
| `delivery_orders` | Entry header |
| `do_items` | Lines (qty, weight, vehicle number copied onto each line) |
| `audit_log` | Hash-chained events |
| `files` | Drive file ids |
| `drive_integrations` | Per-store Drive refresh token |

---

## Run locally

Need Node.js 20+ and a Supabase project with migrations applied.

```bash
git clone https://github.com/Swati-keshari/Enventry-managment-system-for-stores.git
cd Enventry-managment-system-for-stores
npm install
```

Create `.env.local` (gitignored):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Server key |
| `NEXT_PUBLIC_APP_URL` | Public origin (`http://localhost:3000` locally) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enventry Web OAuth client |
| `DRIVE_ROOT_FOLDER_ID` | Drive folder the store may write to |
| `S3_*` | Optional IDrive e2 / S3 |

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

---

## Security path

```
Request → Zod → JWT (Supabase) → RBAC → Postgres RLS → audit append
```

Never put `.env.local` or service-role keys in git.

---

## License

Private — all rights reserved.
