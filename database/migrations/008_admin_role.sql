-- Admin panel (story #109): every account is a user or an admin.
--
-- Everyone who registers is a user. The first admin is promoted from the
-- command line (npm run admin:create -w backend -- <email>); nothing in the API
-- can change a role. Admins still go through row-level security like everyone
-- else, so being an admin never opens another user's expenses, income,
-- budgets or notes.

ALTER TABLE users
  ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));
