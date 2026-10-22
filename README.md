# Smart Expense & Budget Management System

A web app that tracks income and expenses, forecasts monthly spending, flags
unusual transactions, recommends budgets and lets users test a purchase with a
what-if simulator before committing to it.

Requirements, use cases, test plan and architecture documents are in
[`Documents/`](Documents/README.md).

## Stack

| Layer | Technology |
|---|---|
| Presentation | React 19 + Vite |
| Business | Node.js + Express 5 |
| Data | PostgreSQL 17 |

The backend follows the layered design in the architecture documents: every
request enters through one Application Controller (`backend/src/app.js`), which
applies HTTPS enforcement, rate limits, body size limits and session checks
before handing off to a service.

## Repository layout

```
backend/            Express API
  src/app.js        Application Controller (middleware + routing)
  src/db/           Connection pool, migration runner, withUser() scope
  src/routes/       HTTP handlers, one file per area
  src/services/     Business logic; the only place SQL runs
  src/middleware/   Auth check, validation, rate limiting, error handling
  test/             API tests (node:test + Supertest)
frontend/           React app (placeholder page for now)
database/
  migrations/       Numbered SQL files, applied in order
Documents/          SRS, use cases, test plan, architecture
```

## Getting started

You need Node.js 22 or newer and PostgreSQL 17. Create two databases,
`smart_expense` and `smart_expense_test`.

The backend reads its settings from environment variables. Until the
environment setup work lands, create `backend/.env` with at least:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/smart_expense
```

and `backend/.env.test` with:

```
NODE_ENV=test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/smart_expense_test
```

Then:

```bash
npm install
npm run migrate
npm run dev:backend    # API on port 4000
npm run dev:frontend   # web app on port 5173, in a second terminal
```

Optional settings and their defaults are in `backend/src/config.js`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:backend` | API with auto-reload |
| `npm run dev:frontend` | Vite dev server, proxies `/api` to the backend |
| `npm run migrate` | Apply new database migrations |
| `npm test` | Backend tests against the `_test` database |
| `npm run lint` | ESLint for both apps |
| `npm run build` | Production build of the frontend |

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/logout` | Yes | End the session |
| GET | `/api/auth/me` | Yes | Current user |

Registration and login endpoints are still to be added.

## Security decisions

These implement SR01–SR10 from the SRS. Values marked *placeholder* are still to
be agreed by the team and can be changed through environment variables.

| Requirement | Status |
|---|---|
| SR01, SR08 | Every `/api` route requires a session unless it is on a short public list, so new routes are protected by default; refused attempts are logged |
| SR02 | Password hashing: not built yet |
| SR03 | Random 256-bit session token in an HttpOnly, SameSite=Strict cookie. Only its SHA-256 hash is stored, and logout deletes the session |
| SR04 | Every table carries `user_id` and services filter by it. PostgreSQL row-level security is a second layer: queries run through `withUser()` can only reach the logged-in user's rows, even if a filter is missing. IDs from URLs must be UUIDs, and someone else's record returns 404 |
| SR05 | Body size limit (10 KB) and a `validate()` step in the controller; per-field rules not built yet |
| SR06 | Plain HTTP refused in production; HSTS via Helmet; Secure cookies in production |
| SR07 | Idle timeout 15 min (*placeholder*), absolute session lifetime 12 h |
| SR09 | 20 requests per 15 min per IP on `/api/auth/login`, and account lockout for 15 min after 5 failed logins, ready for the login endpoint to use (*placeholders*) |
| SR10 | Logger redacts passwords, tokens and amounts; errors return generic messages with no stack trace |

Sessions are stored server-side instead of using stateless JWTs because SR03
requires a token to stop working immediately after logout.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, code conventions,
the building blocks for the auth and data features, and the PR checklist.
