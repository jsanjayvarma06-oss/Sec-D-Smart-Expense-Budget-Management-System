# Sprint 1 Demo Script (1 minute)

Covers Sanjay's Sprint 1 items: repo structure, database schema, Application
Controller, session management, per-user data isolation, API protection and
branch protection. Each section is roughly ten seconds. Read the narration while
doing the action.

## Before recording

1. Start the database and API (see the root `README.md`), plus the frontend.
2. Open a terminal at the repository root and a browser at http://localhost:5173.
3. On macOS, press `Cmd + Shift + 5` and choose "Record Selected Portion".

## Script

| Time | Action | Narration |
|---|---|---|
| 0:00–0:08 | Show the repo in the editor: `frontend/`, `backend/`, `database/`, then the browser page showing "API and database: connected" | "Sprint 1 sets up the React, Express and PostgreSQL project with a layered architecture, all wired together." |
| 0:08–0:18 | Open `database/migrations/001_initial_schema.sql`, scroll through the tables | "The schema covers users, sessions, income, expenses, categories, budgets, goals and recurring payments. Every record is tied to its owner." |
| 0:18–0:28 | Open `backend/src/app.js`, then run `curl -i localhost:4000/api/auth/me` | "Every request goes through one Application Controller. Any API route without a valid session is refused by default, and the attempt is logged." |
| 0:28–0:38 | Open `backend/src/services/sessionService.js` | "Sessions are stored on the server with only a hash of the token, so logout revokes them instantly, and idle sessions expire." |
| 0:38–0:50 | Run `npm test`, scroll to the ID-tampering tests | "Thirty-six automated tests cover this, including one user changing a URL to read another user's expense. PostgreSQL row-level security refuses it, even if a query forgets its filter." |
| 0:50–1:00 | Show the branch protection settings on GitHub, or the pull request | "Main is protected, so every change goes through a reviewed pull request." |

## Uploading

Export as MP4 and keep it under 25 MB so it can be added through the GitHub
web upload. Name it `Sprint1_Demo.mp4` and add it to `Documents/` through a pull
request, since `main` no longer accepts direct pushes.
