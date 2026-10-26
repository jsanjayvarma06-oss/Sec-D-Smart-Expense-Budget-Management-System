# Smart Expense & Budget Management System

A web app for students and young professionals to track income and expenses,
stay within budgets, and look ahead: it forecasts monthly spending, flags
unusual transactions, recommends budgets and scores financial health.

Built by Team Sec-D: Sanjay, Dinesh and Jahnavi.

## What works

| Feature | Requirement | In the app | API |
|---|---|---|---|
| Register, log in, log out, session timeout | FR01, SR01–SR10 | Yes | Yes |
| Password recovery by email | UC-01 8b | Yes | Yes |
| Expenses: add, edit, delete, flagged-expense review | FR03, FR04, FR11 | Yes | Yes |
| Categories: built-in and your own | FR04 | Yes | Yes |
| Monthly and category budgets, remaining budget | FR06–FR08 | Yes | Yes |
| Budget alerts at 80% and 100% | FR09 | Yes | Yes |
| Recurring payments and reminders | FR16, FR17 | Yes | Yes |
| Financial health score | FR18 | Yes | Yes |
| Income records | FR02 | Not yet | Yes |
| Spending by category and month (chart data) | FR10 | Charts not yet | Yes |
| Monthly spending forecast | FR12 | Not yet | Yes |
| Budget recommendations | FR13 | Not yet | Yes, with a known issue (#45) |
| What-if simulator | FR19 | Not yet | Budget/income simulation; planned-purchase mode missing (#47) |
| Category suggestion from merchant | FR05 | No | Not reachable (#32) |
| Savings goals | FR14, FR15 | No | No |
| Report export | FR20 | No | No |

Everything that differs from the SRS, with owners, is listed in
[`Documents/09_Decisions_and_Deviations.md`](Documents/09_Decisions_and_Deviations.md).

## Stack and design

| Layer | Technology |
|---|---|
| Presentation | React 19 + Vite |
| Business | Node.js + Express 5 |
| Data | PostgreSQL 17 |

The backend follows the layered design in the architecture documents. Every request
enters through one Application Controller (`backend/src/app.js`). It applies HTTPS
enforcement, rate limits, body size limits and the session check before a route runs.
Every `/api` route needs a session unless it's on a short public list. User data is
read and written through `withUser()`, which turns on PostgreSQL row-level security,
so no query can reach another user's rows.

## Repository layout

```
backend/
  src/app.js        Application Controller (middleware and routing)
  src/db/           Connection pool, migration runner, withUser() scope
  src/routes/       HTTP handlers, one file per area
  src/services/     Business logic; the only place SQL runs
  src/middleware/   Session check, validation, rate limiting, error handling
  scripts/          Backup, restore, crash drill, load tests, test results, outbox
  test/             API tests; test/plan/ holds the 50 test-plan cases
frontend/src/       React app
database/migrations Numbered SQL files, applied in order
Documents/          Requirements, design, test and performance documents
.github/            CI workflow, PR template, code owners
```

## Getting started

You need Node.js 22 or newer and PostgreSQL 17. Create two databases,
`smart_expense` and `smart_expense_test`.

Create `backend/.env`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/smart_expense
```

and `backend/.env.test`:

```
NODE_ENV=test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/smart_expense_test
```

Then:

```bash
npm install
npm run migrate
npm run dev:backend    # API on port 4000
npm run dev:frontend   # web app on http://localhost:5173, in a second terminal
```

Password reset emails go to a local outbox until SMTP is set up;
`npm run mail:latest -w backend` shows the newest one.

### Settings

All settings are environment variables. Only `DATABASE_URL` is required.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | none | PostgreSQL connection string |
| `DATABASE_SSL` | off | `require` to encrypt the database connection |
| `PORT` | 4000 | API port |
| `NODE_ENV` | development | `production` turns on HTTPS-only and Secure cookies |
| `CORS_ORIGIN` | http://localhost:5173 | Web app origin(s), comma-separated |
| `SESSION_IDLE_MINUTES` | 15 | Idle timeout (SR07) |
| `SESSION_MAX_HOURS` | 12 | Absolute session lifetime |
| `LOGIN_MAX_FAILED_ATTEMPTS` | 5 | Failed logins before lockout (SR09) |
| `LOGIN_LOCKOUT_MINUTES` | 15 | Lockout length |
| `LOGIN_RATE_LIMIT` | 20 | Login requests per 15 minutes per source |
| `API_RATE_LIMIT` | 300 | API requests per 15 minutes per source |
| `APP_URL` | http://localhost:5173 | Where password reset links point |
| `PASSWORD_RESET_MINUTES` | 30 | Reset link lifetime |
| `SMTP_URL` | none | SMTP server for email; unset means the local outbox |
| `MAIL_FROM` | Smart Expense &lt;no-reply@localhost&gt; | Sender address |
| `API_PROXY_TARGET` | http://localhost:4000 | Frontend dev server's API address (`frontend/.env`) |

## Scripts

Run from the repository root.

| Command | What it does |
|---|---|
| `npm run dev:backend` / `npm run dev:frontend` | Run the API / web app with auto-reload |
| `npm run migrate` | Apply new database migrations |
| `npm test` | All backend tests against the `_test` database |
| `npm run lint` | ESLint for both apps |
| `npm run build` | Production build of the web app |
| `npm run test:plan -w backend` | Run the 50 test-plan cases and regenerate `Documents/07_Test_Results.md` |
| `npm run db:backup` | Back up the database to `backups/` |
| `npm run db:restore -w backend -- <file> --yes` | Restore a backup, replacing current data |
| `npm run db:crash-drill -w backend -- --yes` | Forced-shutdown test for NFR10 (stops PostgreSQL; never on production) |
| `npm run load:seed -w backend` / `npm run load:run -w backend` | Load-test data and runner for NFR01 and NFR05 |
| `npm run mail:latest -w backend` | Show the newest email in the local outbox |

## Quality

- **Tests:** 232 automated tests run on every pull request through the CI workflow.
- **Test plan:** 40 of 50 cases pass, 5 fail as known gaps and 5 aren't run because the feature isn't built. See [Test Results](Documents/07_Test_Results.md).
- **Calculations (NFR04):** 100 transactions match a hand calculation to the paisa.
- **Performance (NFR01, NFR05):** the dashboard loads in under 70 ms with a year of data, and 1,000 users with 100,000 transactions don't slow it down. See [Performance Results](Documents/08_Performance_Results.md).
- **Recovery (NFR10):** records survive killing the API and power-cutting PostgreSQL. See [Backup and Recovery](Documents/06_Backup_and_Recovery_Strategy.md).

## Security

| Requirement | How it's met |
|---|---|
| SR01, SR08 | Every `/api` route requires a session unless it's on a short public list; refused attempts are logged |
| SR02 | Passwords hashed with bcrypt (cost 12); unknown emails take the same time to reject |
| SR03 | Random 256-bit session token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 hash is stored; logout deletes it |
| SR04 | Queries filter by user, and PostgreSQL row-level security enforces it; other users' records answer 404 |
| SR05 | Every request body validated on the server; 10 KB body limit; client-supplied dates bounded |
| SR06 | HTTPS only in production, HSTS, Secure cookies, optional TLS to the database |
| SR07 | Sessions end after 15 idle minutes or 12 hours; the app returns to login with a message |
| SR09 | Lockout after 5 failed logins; per-source limits on login, password reset and all API routes |
| SR10 | Logs redact amounts, notes, emails, passwords and tokens; errors show no internal detail |

Sessions are stored server-side instead of in stateless JWTs because SR03 requires
a token to stop working the moment the user logs out.

## Documents

See [`Documents/README.md`](Documents/README.md) for the full list: SRS, use cases,
test plan, architecture, backup strategy, test and performance results, decisions
and deviations, and the API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, code conventions, how
to work with user data safely, and the PR checklist. Put `Closes #<issue>` in
every PR description so the board updates itself when it merges.
