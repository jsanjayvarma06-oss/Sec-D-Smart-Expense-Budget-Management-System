# Contributing

## Branches and pull requests

- `main` is always deployable. Never push to it directly.
- Branch from `main` using `<type>/<short-description>`, for example
  `feature/expense-crud`, `fix/budget-rounding`, `docs/update-srs`.
- Open a pull request and fill in the template. At least one teammate reviews
  before merging; CI must be green.
- Mention the project item in the PR description so the board stays current.

## Commit messages

Short imperative summary, optionally followed by a blank line and detail:

```
Add expense CRUD endpoints

Covers FR03 and test cases UT_07 to UT_11.
```

## Code conventions

- **Language:** modern JavaScript (ES modules) on both sides. No TypeScript for now.
- **Formatting:** 2-space indent, single quotes, semicolons, trailing commas.
  `npm run lint` must pass.
- **Naming:** `camelCase` for variables and functions, `PascalCase` for React
  components and their files, `snake_case` for database tables and columns.
- **Layers (backend):** routes handle HTTP only, services hold business rules,
  and only services run SQL. This matches the layered architecture in
  `Documents/Architecture_Justification.pdf`.
- **Money:** store as `NUMERIC(12, 2)`. Never use JavaScript floats to add up
  amounts; do sums in SQL or with integer paise.
- **Security rules that apply to every change:**
  - run every query on user data inside `withUser(req.user.id, ...)` and still
    include `WHERE user_id = $n` (SR04, see below)
  - put `validateIdParam()` on every route with an `:id`
  - validate request bodies with a schema through `validate()` (SR05)
  - never log request bodies, amounts, tokens or passwords (SR10)

## Building blocks for registration and login

Sessions, lockout and rate limiting are already in place. The registration and
login endpoints go in `backend/src/routes/authRoutes.js` and use:

| Need | Use |
|---|---|
| Start a session after the password checks out | `createSession(user.id)` from `services/sessionService.js`, then set the cookie with `sessionCookieOptions()` from `middleware/requireAuth.js` (example at the top of `sessionService.js`) |
| Lock an account after repeated failures (SR09) | `isLocked`, `recordFailedLogin` and `resetFailedLogins` from `services/loginProtection.js` |
| Per-IP limit on login attempts | Already applied to `/api/auth/login` in `app.js` |
| Make the routes reachable without a session | `POST /api/auth/register` and `POST /api/auth/login` are already in `PUBLIC_ROUTES` |
| Validate the request body (SR05) | `validate(schema)` from `middleware/validate.js`, with any schema that has a zod-style `safeParse()` |
| Store the password (SR02) | `users.password_hash` column; hashing is up to the registration and hashing items |

Logout (`POST /api/auth/logout`) and the current user (`GET /api/auth/me`)
already work. The users table has `failed_login_count` and `locked_until` for
the lockout.

## Working with user data (SR04)

Every `/api` route needs a session by default. Only the routes listed in
`PUBLIC_ROUTES` in `backend/src/middleware/requireAuth.js` are open, so new
routes are protected without adding anything. `req.user` is always set inside
them.

Read and write user data through `withUser` from `backend/src/db/userScope.js`.
It switches to a database role that row-level security applies to, so a query
can only ever see the logged-in user's rows:

```js
router.get('/:id', validateIdParam(), async (req, res, next) => {
  try {
    const expense = await withUser(req.user.id, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id],
      );
      return rows[0];
    });
    if (!expense) throw new HttpError(404, 'Not found');
    res.json({ expense });
  } catch (err) {
    next(err);
  }
});
```

Return 404, never 403, when a record is missing or belongs to someone else, so
changing an ID in the URL doesn't reveal that the record exists.
`backend/test/dataIsolation.test.js` shows the pattern and the ID-tampering
tests.

## Database changes

Add a new numbered file in `database/migrations/` (for example
`003_add_expense_tags.sql`). Never edit a migration that has already been merged;
write a new one instead. Run `npm run migrate` to apply it.

A new table that holds user data needs a `user_id` column plus, in the same
migration:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON my_table TO app_user;
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE my_table FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON my_table
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
```

A test fails if any table with a `user_id` column is missing row-level security.

## Tests

Backend tests live in `backend/test/` and use Node's built-in test runner with
Supertest. Name tests after the test plan IDs where one exists, e.g.
`'UT_08 refuses a negative amount'`.
