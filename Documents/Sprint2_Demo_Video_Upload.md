# Sprint 2 Demo Video — Upload Instructions

This file records the upload location for the Sprint 2 demo video required by issue #67.

## Status

The 2-minute walkthrough script is in [`Documents/Sprint2_Demo_Script.md`](Sprint2_Demo_Script.md).

**Recording instructions (macOS):** press `Cmd + Shift + 5`, choose _Record Selected Portion_, enable the microphone in Options, then follow the script row by row.

Export as MP4, name it `Sprint2_Demo.mp4`, and keep it under 25 MB (GitHub file-upload limit via the web UI).

## How to upload

1. Record the video following `Sprint2_Demo_Script.md`.
2. Go to the GitHub repo → `Documents/` folder → _Add file → Upload files_.
3. Upload `Sprint2_Demo.mp4`.
4. Commit directly to `main` with the message:
   ```
   docs: add Sprint 2 demo video (Closes #67)
   ```

## What the video should show

| Time | Feature |
|---|---|
| 0:00–0:15 | Register + login (bcrypt, lockout) |
| 0:15–0:30 | Set budget, category limits, validation |
| 0:30–0:45 | Add expenses, see 80% alert |
| 0:45–1:00 | Recurring payments, reminders, health score |
| 1:00–1:15 | Password recovery (single-use link, 30-min expiry) |
| 1:15–1:30 | Run `npm run test:plan -w backend` — 50 automated tests |
| 1:30–1:45 | `Documents/08_Performance_Results.md` — 69 ms dashboard at scale |
| 1:45–2:00 | GitHub board, merged PR with "Closes #…" |

Sprint 2 highlights to mention:
- **Ask Money** — natural language queries (e.g. "How much did I spend on food last month?")
- **Receipt scanning** — camera/file → Tesseract.js OCR in browser → fills expense form
- **Security monitor** — failed-login counts and lockouts visible to admins
- **What-if simulator** — planned purchase impact on remaining budget
- **Expense search + CSV export** — search bar with pagination, export to CSV

---
*Once uploaded, close issue #67 with: `gh issue close 67 --comment "Sprint 2 demo video uploaded to Documents/Sprint2_Demo.mp4"`*
