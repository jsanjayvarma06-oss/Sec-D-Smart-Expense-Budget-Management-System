# Sprint 2 Demo Script (2 minutes)

Shows the app as it stands at the end of Sprint 2: the working screens, the
security and recovery work, and the evidence behind the quality figures. Each
row is about 15 seconds. Read the narration while doing the action.

## Before recording

1. Start PostgreSQL, run `npm run migrate`, then `npm run dev:backend` and `npm run dev:frontend` in two terminals.
2. Open http://localhost:5173 logged out, with an email that isn't registered yet.
3. Keep a terminal open at the repository root, and the GitHub project board open in another tab.
4. On macOS, press `Cmd + Shift + 5` and choose "Record Selected Portion". Turn on the microphone in Options if you narrate live.

## Script

| Time | Action | Narration |
|---|---|---|
| 0:00–0:15 | Register, then log in | "Sprint 2 builds on the foundation from Sprint 1. Users register and log in; passwords are hashed with bcrypt, and five wrong attempts lock the account." |
| 0:15–0:30 | Set a monthly budget of 10,000 and a Food budget of 3,000 | "Users set a monthly budget and category limits. The app won't let category limits add up to more than the monthly budget." |
| 0:30–0:45 | Add expenses: 2,000 Food, then 6,500 Shopping. Show the remaining budget and the 80% alert in notifications | "Every expense updates the remaining budget immediately, and alerts arrive at 80% and again at 100%, never twice." |
| 0:45–1:00 | Add a monthly recurring payment due in two days; show the reminder; scroll to the health score | "Recurring payments are created on their due date with reminders three days before, and the health score explains itself in plain words." |
| 1:00–1:15 | Log out, click "Forgot your password?", request a link; in the terminal run `npm run mail:latest -w backend` and open the link; set a new password | "Password recovery sends a single-use link that expires in 30 minutes and logs the account out everywhere." |
| 1:15–1:30 | In the terminal run `npm run test:plan -w backend`; open `Documents/07_Test_Results.md` | "All 50 test-plan cases are automated. 40 pass, and the rest are known gaps or features still to build, each tracked on the board." |
| 1:30–1:45 | Open `Documents/08_Performance_Results.md` and scroll to the tables | "With 1,000 users and 100,000 transactions, the dashboard still loads in under 70 milliseconds, against a 3-second target." |
| 1:45–2:00 | Show the GitHub board and a merged pull request that says "Closes #…" | "Every change goes through a reviewed pull request, and merging one moves its cards to Done automatically, which drives our burn-up chart." |

## Uploading

Export as MP4 and keep it under 25 MB so it can be added through the GitHub
web upload. Name it `Sprint2_Demo.mp4`, add it to `Documents/` on a new branch,
and open a pull request with `Closes #67`.
