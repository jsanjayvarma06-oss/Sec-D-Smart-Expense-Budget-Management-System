# API Reference

Smart Expense & Budget Management System. The web app talks to the Express API
under `/api`, using JSON in both directions.

## Conventions

- **Login.** Every route needs a logged-in session except those marked **Public**. The session is the HttpOnly `sid` cookie set by `POST /api/auth/login`; the browser sends it automatically.
- **Your data only.** Every record belongs to the logged-in user. A record that belongs to someone else answers `404`, exactly like a missing one.
- **Amounts** are decimal strings in stored records (`"450.00"`) and numbers in calculated results.
- **Dates** use `YYYY-MM-DD`; months use `YYYY-MM`.
- **Errors** look like `{ "error": "message", "code": "CODE", "fields": { "field": "message" } }`, with `fields` only on validation errors.

| Status | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Not logged in, or the session ended |
| 404 | Not found, or not yours |
| 409 | Conflict, e.g. email already registered or category in use |
| 413 | Request too large (over 10 KB) |
| 429 | Too many requests or account locked |
| 503 | Server busy |

## Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | **Public.** `{ "status": "ok" }` when the API and database are reachable |

## Accounts and sessions

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | `name`, `email`, `password` | **Public.** Create an account (`201`); `409` if the email is taken |
| POST | `/api/auth/login` | `email`, `password` | **Public.** Start a session and set the `sid` cookie. `401` for wrong details, `429` when locked or rate limited |
| POST | `/api/auth/logout` | none | End this session (`204`) |
| GET | `/api/auth/me` | none | The logged-in user |
| POST | `/api/auth/forgot-password` | `email` | **Public.** Always `202` with the same message; emails a reset link if the account exists |
| POST | `/api/auth/reset-password` | `token`, `password` | **Public.** Set a new password from the emailed link; logs out every session. `400` if the link is invalid or expired |

## Income

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/income` | none | List income records |
| POST | `/api/income` | `amount`, `source`, `received_on`, optional `is_recurring`, `note` | Add income |
| PUT | `/api/income/:id` | same as POST | Change an income record |
| DELETE | `/api/income/:id` | none | Delete it (`204`) |

## Expenses

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/expenses` | none | List expenses, newest first |
| POST | `/api/expenses` | `amount`, `category_id`, `spent_on` (not in the future), optional `merchant`, `note` | Add an expense. The reply includes `is_flagged` and an `anomaly` explanation when it's unusually large |
| PUT | `/api/expenses/:id` | same as POST | Change an expense |
| DELETE | `/api/expenses/:id` | none | Delete it (`204`) |
| PATCH | `/api/expenses/:id/review` | none | Confirm a flagged expense and clear the flag |

## Categories

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/categories` | none | Built-in categories plus your own |
| POST | `/api/categories` | `name` | Add your own category |
| PUT | `/api/categories/:id` | `name` | Rename your category |
| DELETE | `/api/categories/:id` | none | Delete your category; `409` while expenses, budgets or recurring payments use it |

## Budgets

| Method | Path | Query or body | Purpose |
|---|---|---|---|
| GET | `/api/budgets` | `?month=YYYY-MM` | Budgets for a month |
| POST | `/api/budgets` | `month`, `amount`, optional `category_id` | Set the monthly budget, or a category budget. Category budgets together can't exceed the monthly one (`400`) |
| PUT | `/api/budgets/:id` | `amount` | Change a budget |
| DELETE | `/api/budgets/:id` | none | Delete it (`204`) |
| GET | `/api/budgets/remaining` | `?month=YYYY-MM` | Budget, spent, remaining and `exceeded` for each budget that month |
| GET | `/api/budgets/alerts` | `?month=YYYY-MM` | Budgets at 80% or 100%; also saves each as a notification, once |
| GET | `/api/budgets/recommendations` | none | Suggested category budgets from the last 3 months (needs income in that period) |

## Recurring payments

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/recurring-expenses` | none | List recurring payments with next due dates |
| POST | `/api/recurring-expenses` | `category_id`, `amount`, `cycle` (`weekly` or `monthly`), `start_date` (within a year of today), optional `note` | Add one |
| POST | `/api/recurring-expenses/generate-due` | `today` (within a day of the real date) | Create the expenses that have fallen due; never twice per cycle, at most 60 per run |
| PATCH | `/api/recurring-expenses/:id/pay` | `due_date` | Mark a cycle as paid, which stops its reminders |

## Notifications

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | `?unreadOnly=true` optional | Budget alerts and payment reminders |
| PATCH | `/api/notifications/:id/read` | none | Mark one as read |
| POST | `/api/notifications/payment-reminders` | `today` | Create reminders for payments due in the next 3 days |

## Analysis

| Method | Path | Query or body | Purpose |
|---|---|---|---|
| GET | `/api/analytics/monthly` | `?month=YYYY-MM` | Total spent, comparison with the previous month, totals by category and by day (the data for the charts) |
| GET | `/api/forecast/monthly` | none | Forecast for this month from the last 3 complete months; `available: false` with a reason when there's too little history |
| GET | `/api/financial-health` | `?month=YYYY-MM` | Score 0–100, rating, income, expenses, savings rate, budget use and the reasons behind the score |
| POST | `/api/what-if/simulate` | `month`, `proposedBudget`, `proposedIncome` | Simulate a different budget and income for a month, with the forecast; nothing is saved |

## Limits

| What | Limit |
|---|---|
| Request body | 10 KB |
| Any `/api` route | 300 requests per 15 minutes per source (`API_RATE_LIMIT`) |
| Login | 20 requests per 15 minutes per source (`LOGIN_RATE_LIMIT`); 5 wrong passwords lock the account for 15 minutes |
| Password reset routes | 5 requests per 15 minutes per source |
| Sessions | End after 15 idle minutes or 12 hours |
