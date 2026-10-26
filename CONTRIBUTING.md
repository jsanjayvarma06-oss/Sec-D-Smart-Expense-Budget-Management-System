# Contributing

## Branches and pull requests

- `main` is always deployable. Never push to it directly.
- Branch from `main` using `<type>/<short-description>`, for example
  `feature/expense-crud`, `fix/budget-rounding`, `docs/update-srs`.
- Open a pull request and fill in the template. At least one teammate reviews
  before merging; CI must be green.
- Put `Closes #<issue>` in the PR description for every card it finishes. When
  the PR merges, GitHub closes those issues and the board moves the cards to
  Done, which is what the burn-up chart counts. Don't move cards to Done by
  hand before the work is merged.

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

## Authentication building blocks

Registration, login, logout, sessions, lockout and password recovery are all
built. If you add anything that logs a user in or out, reuse these:

| Need | Use |
|---|---|
| Start a session | `createSession(user.id)` from `services/sessionService.js`, then set the cookie with `sessionCookieOptions()` from `middleware/requireAuth.js` |
| End sessions | `destroySession(token)`, or delete the user's rows in `sessions` to log out everywhere |
| Lockout after repeated failures (SR09) | `isLocked`, `recordFailedLogin`, `resetFailedLogins` from `services/loginProtection.js` |
| Check a password without revealing whether the email exists | `verifyPassword`, or `verifyAgainstDummyHash` for an unknown email, from `services/passwordService.js` |
| A route that works without logging in | Add it to `PUBLIC_ROUTES` in `middleware/requireAuth.js` and give it a rate limit in `app.js` |
| Validate a request body (SR05) | `validate(schema)` from `middleware/validate.js` with a zod schema |
| Send an email | `sendMail()` from `services/mailService.js` (SMTP, or the local outbox in development) |

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
Supertest. CI runs all of them on every pull request.

The 50 test-plan cases are in `backend/test/plan/`, one test per ID, written with
`planTest()` from `planHelpers.js`. Each returns a sentence describing what
actually happened. When a feature lands that a case was waiting for:

- **The case was "not implemented".** Replace its `notImplemented(...)` line with a real `planTest`.
- **The case was a known gap.** Remove its `gap` option once it passes.
- **Either way,** run `npm run test:plan -w backend` and commit the regenerated `Documents/07_Test_Results.md`.

Tests that depend on today's date must compute dates relative to now. The API
refuses a "today" more than a day away from the real date.
