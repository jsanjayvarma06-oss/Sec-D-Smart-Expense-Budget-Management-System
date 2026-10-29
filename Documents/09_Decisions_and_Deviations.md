# Decisions and Deviations

Smart Expense & Budget Management System, end of Sprint 2 (26 October 2026).

The Secure Architecture Design asks that "any place where the final build
differs from the submitted SRS, SAD or test plan should be written down, so it
can be explained at the final demo". This document does that in three parts:

1. **Thresholds.** The placeholder values in the SRS, with the values the build uses, for the team to agree.
2. **SRS updates.** Acceptance criteria that change once those values are agreed.
3. **Deviations.** Where the build differs from the SRS, use case flows, SAD and test plan, and who owns each one.

Evidence for test-related items is in `07_Test_Results.md`, and for performance in `08_Performance_Results.md`.

---

## 1. Thresholds (proposed, needs team agreement)

The SRS left several numbers as placeholders ("e.g. 80%", "decide the timeout"). The build uses the values below. Most can be changed through environment variables without touching code. **These are proposals until all three team members sign below.**

| Threshold | SRS reference | Value in the build | Where set |
|---|---|---|---|
| Budget warning alert | FR09 ("e.g. 80%") | 80% of a budget; a second alert at 100% | `budgetAlertService.js` |
| Session idle timeout | SR07 ("e.g. 15 minutes") | 15 minutes | `SESSION_IDLE_MINUTES` |
| Absolute session lifetime | SR03 | 12 hours | `SESSION_MAX_HOURS` |
| Failed logins before lockout | SR09 | 5 in a row | `LOGIN_MAX_FAILED_ATTEMPTS` |
| Lockout length | SR09 | 15 minutes | `LOGIN_LOCKOUT_MINUTES` |
| Login requests per source | SR09 | 20 per 15 minutes | `LOGIN_RATE_LIMIT` |
| API requests per source | SR09 | 300 per 15 minutes | `API_RATE_LIMIT` |
| Password reset requests per source | SR09 | 5 per 15 minutes | `app.js` |
| Password reset link lifetime | UC-01 8b | 30 minutes | `PASSWORD_RESET_MINUTES` |
| Reminder before a recurring payment | FR17 ("how many days?") | 3 days before the due date | `notificationService.js` |
| Minimum history for a forecast | FR12, NFR08 | 3 complete months | `forecastService.js` |
| Forecast accuracy margin | NFR08 (15%) | Not measured yet, since there is no real usage data to compare against | n/a |
| Unusual spending | FR11 ("how many months?") | More than 3× the average of the last 20 expenses in that category, once there are at least 5 | `anomalyDetectionService.js` |
| Minimum history for budget recommendations | FR13 | 3 complete months, plus income in that period | `budgetRecommendationService.js` |
| Income kept back from recommendations | FR13 | 10% of income is not allocated to any category | `budgetRecommendationService.js` |
| Health score bands | FR18 | Excellent ≥ 80, Good ≥ 65, Fair ≥ 45, else Needs improvement | `financialHealthService.js` |
| Dashboard load time | NFR01 ("a few seconds") | 3 seconds; measured at 69 ms worst case | `08_Performance_Results.md` |
| Backups | NFR10 ("mention frequency") | Daily locally, keep 14; production proposals in `06_Backup_and_Recovery_Strategy.md` | `BACKUP_KEEP` |

### Sign-off

| Team member | Agree with the values above? | Changes wanted | Date |
|---|---|---|---|
| Sanjay | | | |
| Dinesh | | | |
| Jahnavi | | | |

Once everyone has signed, close card #68.

---

## 2. SRS updates

These acceptance criteria in `01_SRS_Document.pdf` should read as follows once the thresholds are agreed. The PDF is generated from a source document that isn't in the repository, so the changes are recorded here for whoever edits it.

| ID | Current wording | Updated wording |
|---|---|---|
| FR07 | "Should the app stop this or just warn?" | Category budgets that add up to more than the monthly budget are **refused**, with the message "The combined category budgets cannot exceed the overall monthly budget". The UC-04 flow (8c–8d) described a warning the user could override, so update it to match. |
| FR09 | "Fix the threshold, e.g. 80%" | Alerts at 80% and at 100% of a budget, each sent once per budget per month. |
| FR11 | "How many past months are needed?" | At least 5 earlier expenses in the category; flagged above 3× their average. |
| FR12 / NFR08 | "Needs a minimum history rule" | At least 3 complete months. The 15% accuracy target stays, to be checked once real data exists. |
| FR17 | "How many days before? Fix a number." | 3 days before the due date. |
| NFR01 | "a few seconds" | Under 3 seconds with one year of data (already the acceptance figure). |
| SR07 | "Decide the timeout, e.g. 15 minutes" | 15 minutes idle; sessions also end 12 hours after login. |
| SR09 | "Fix the limit and the lockout time" | 5 failed logins lock the account for 15 minutes; 20 login requests per 15 minutes per source. |
| NFR10 | "Mention backup frequency" | See `06_Backup_and_Recovery_Strategy.md`. |

---

## 3. Deviations

**Status values:**
- **Open:** the build doesn't meet the document yet.
- **Changed:** the build intentionally differs, with the reason given.
- **Added:** the build goes beyond the document.

### Requirements and use case flows

| Item | Document says | Build does | Status | Owner / card |
|---|---|---|---|---|
| FR01 / UC-01 step 4 | Password must meet "the strength rule" | Requires 8–72 characters only; no mix of letters, numbers and symbols is enforced | Open | Registration (#14) |
| UC-01 8b | "User may … start password recovery" | Built in Sprint 2: emailed single-use link, 30-minute expiry | Added | Sanjay (#29) |
| FR02 / UC-02 | User adds, edits and deletes income | The income API is complete and tested, but the dashboard has no income screen, so income can't be entered in the app yet | Open | Dashboard / income UI |
| FR05 | A category is suggested from the merchant name | The suggestion code exists but can't be reached: the API requires a category, and the form offers no suggestion (UT_13) | Open | Dinesh (#32) |
| FR07 / UC-04 8c–8d | Over-allocated category budgets: warn, user may continue | Refused outright | Changed: stricter, keeps totals consistent; update UC-04 | Team decision |
| FR10 / UC-05 | Pie, bar and line charts | The data behind the charts is complete and correct (UT_18, UT_19, IT_04), but no charts are drawn yet | Open | Jahnavi (#39, #40, #41) |
| FR13 | Recommendations stay within income | They report 3 months of income as one month (₹45,000 for a ₹15,000 salary), and the last category is padded to use up the whole limit (IT_08). Not shown in the UI | Open | Dinesh (#45) |
| FR14, FR15 / UC-06 | Savings goals and time-to-goal | Not built (UT_24–UT_26 not run) | Open | Jahnavi (#50, #51) |
| FR16 / UC-07 step 8 | "When a cycle begins, the system creates the expense automatically" | Due entries are created when the user opens the dashboard; there is no background job, so nothing is created for users who don't log in | Changed: acceptable for the project size; a scheduled job would be needed in production | Team decision |
| UC-07 10a–10b | Overdue payments are marked and highlighted | Built: a missed payment is labelled overdue on the dashboard, gets one follow-up notification, and "Mark as paid" stops the reminders and the overdue label | Added | Dinesh (#52) |
| FR19 / UC-08 | Simulate a planned purchase; verdict affordable / not affordable; never saved | Simulates a proposed budget and income instead; no purchase input or verdict (UT_29, UT_30). It's never saved (UT_31 passes). No screen | Open | Dinesh (#47) |
| FR20 / UC-10 | Export a report as PDF or CSV | Not built (UT_32, UT_33, ST_05) | Open | Jahnavi (#54, #55) |
| Recurring monthly dates | (implied) a payment on the 31st stays on the last day of each month | Drifts: 31 Jan → 28 Feb → 28 Mar | Open | Recurring (#53); no card yet |
| Record IDs in URLs | Malformed IDs answer 404 like missing records | Some routes answer 400 | Open | Minor, no card yet |

### Secure Architecture Design (SAD)

| Item | SAD says | Build does | Status |
|---|---|---|---|
| SR04 per-user access | "Every database query filters by the logged-in user's ID" | Does that, and also enforces it in PostgreSQL with row-level security, so a query that forgets the filter still can't read another user's rows | Added |
| SR03 sessions | "Tokens that stop working after logout" | Server-side sessions storing only a hash of the token, rather than stateless JWTs, because JWTs can't be revoked at logout | Changed: needed to meet SR03 |
| SR06 transit encryption | HTTPS, and TLS to the database | HTTPS enforced in production with HSTS and Secure cookies; TLS to the database available with `DATABASE_SSL=require` but off by default for local development | Changed: configuration, not code |
| Encryption at rest | Open question in the SAD | Still open; depends on the hosting choice | Open |
| Notification Service | Delivers budget alerts and reminders | In-app notifications only; password reset is the only email | Changed |
| Database pool | (not specified) | A request waits at most 5 s for a database connection, then gets "server busy" (503) instead of hanging; added after a review found the pool could freeze (#70) | Added |

### Test plan

| Item | Plan says | What happened | Status |
|---|---|---|---|
| Testing type | Manual testing in Chrome and Firefox | All 50 cases automated through the real API (`backend/test/plan/`), with the main screens also checked in a browser. Results generated from the run in `07_Test_Results.md` | Changed: repeatable, and it runs in CI |
| Test accounts | Two fixed accounts | Each test creates its own accounts, so tests can't affect each other | Changed |
| UT_01 | "Taken to the dashboard" after registering | Taken to the login page first, as UC-01 step 6 specifies | Changed: follows UC-01 |
| UT_04 | "Email already registered" | "An account with this email already exists" | Changed: same meaning |
| UT_09 | "Date cannot be in the future" | "Expense date cannot be in the future" | Changed: same meaning |
| Results | 50 cases | 40 pass, 5 fail as known gaps, 5 not run (features not built). See section 3 above for the owners | Open for the gaps |
