# Sprint 1 Demo Script (1 minute)

Shows the Sprint 1 work merged in #1, #2 and #3: the project foundation and
security, registration and login, expenses, budgets and the dashboard, backup
and recovery, and the board. Each row is about ten seconds. Read the narration
while doing the action.

## Before recording

1. Start the database, then in two terminals run `npm run dev:backend` and
   `npm run dev:frontend` (see the root `README.md`). Run `npm run migrate`
   first if the database is new.
2. Open http://localhost:5173 in a browser window, logged out.
3. Open a terminal next to it, at the repository root.
4. Use an email that isn't registered yet, so registration works on camera.
5. On macOS, press `Cmd + Shift + 5` and choose "Record Selected Portion".

## Script

| Time | Action | Narration |
|---|---|---|
| 0:00–0:08 | Show the repo in the editor: `frontend/`, `backend/`, `database/migrations/` | "Smart Expense and Budget is a React, Express and PostgreSQL app with a layered architecture." |
| 0:08–0:18 | Click Register, enter a name, email and a strong password, Create account, then log in | "Users register with a strong password, stored only as a bcrypt hash, and log in to a server-side session." |
| 0:18–0:30 | Set monthly budget to 10,000. Add an expense of 500, category Food, merchant "Campus canteen". Point at Remaining budget | "Setting a budget and adding an expense updates the remaining budget straight away: 10,000 minus 500 leaves 9,500." |
| 0:30–0:38 | Try to add an expense with a negative amount | "Every entry is validated on the server, so bad amounts and future dates are refused." |
| 0:38–0:46 | Log out. In the terminal run `curl -i localhost:4000/api/expenses` | "Without a session every API route is refused. Row-level security in PostgreSQL also stops one user reading another's records." |
| 0:46–0:54 | Run `npm test` and let the summary show 159 passing | "159 automated tests cover the test plan cases, including ID tampering, session expiry, and records surviving a forced shutdown." |
| 0:54–1:00 | Show the GitHub project board's Sprint 1 view or burn-up chart | "Sprint 1 work goes through reviewed pull requests, and the board updates as each one merges." |

## Uploading

Export as MP4 and keep it under 25 MB so it can be added through the GitHub
web upload. Name it `Sprint1_Demo.mp4` and upload it to `Documents/` on the
`sprint1/demo-video` branch (on GitHub: switch to the branch, then Add file →
Upload files). The pull request for that branch closes the demo card when it
merges.
