# QA Sign-off Report

**Project:** Smart Expense & Budget Management System (Sec-D)
**Issue:** #163, Phase 2c (Review & Sign-off)
**Review date:** November 6, 2026
**Reviewer:** Dinesh Jadage
**Reviewed:** `main` at `1d4bfcb`, with the one fix in this change
**Decision:** **Approved with conditions.** The software passes everything that was run. Seven documentation and test-plan items in section 6 should be closed before the final submission.

---

## 1. What was reviewed

All reports in `Documents/Test_Reports/`, `Documents/07_Test_Results.md` and `Documents/09_Decisions_and_Deviations.md`. The reports were checked against the test plan (`backend/test/plan/testPlan.json`), against the recorded result files (`backend/test-results/*.json`), and against a fresh run of every test suite on the latest `main`.

## 2. Independent re-run on the latest main

| Check | Result |
|---|---|
| Whole backend suite (unit, integration, system, NFR04 and every other test file) | 534 of 534 passed, 0 failed |
| The 68 recorded plan cases (`npm run test:plan`) | 68 of 68 passed, in four timezones (IST, UTC, Los Angeles, Auckland) |
| Frontend unit tests | 37 of 37 passed |
| Responsive browser tests (RWD_01–RWD_05, Chromium) | 5 of 5 passed |
| Lint (backend and frontend) | Clean |
| Production build (`npm run build`) | Succeeds |
| GitHub Actions on `1d4bfcb` | Green |
| Code coverage, whole backend suite | 97.2% of lines, 95% of functions, 87.9% of branches in `backend/src/` |

Environment: Linux, Node.js v22.23.4, PostgreSQL 16.15, run against a new empty database. The team's reports were run on macOS with Node 24 and PostgreSQL 17, and CI is green, so the result does not depend on one machine. Firefox and WebKit were not available here. Jahnavi's screenshots in `artifacts/issue-166/` cover them.

## 3. Test plan accounting

The plan lists 87 cases. This is where each one stands.

| Group | Cases | Status |
|---|:---:|---|
| Recorded in the result files by the plan runner | 67 | Pass |
| UT_51, UT_52 and ESP_01–ESP_10, tested in `backend/test/issue164.test.js` | 12 | Pass in the full run, not in the plan runner's result files |
| RWD_01–RWD_05, Playwright browser tests | 5 | Pass on Chromium |
| IT_12, IT_13, ST_07: **no test has been written** | 3 | **Not run** |
| **Total** | **87** | |

NFR04 (the 100-transaction calculation check) is outside the 87 and passes.

## 4. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | Medium | **IT_10 failed in India between 00:00 and 05:30 IST.** The server accepts a client-sent "today" only within one day of the UTC date. IT_10 sent tomorrow's date as computed in the machine's local time, which is two days ahead of UTC at those hours, so the server answered 400. CI runs in UTC and never showed it. | **Fixed in this change.** The test now uses today's date and passes in all four timezones. |
| F2 | High | **IT_12, IT_13 and ST_07 have no test.** They cover failed logins triggering a security event and lockout (SR09), natural-language queries staying inside one user's data, and the full password recovery journey. | Open, see C1 |
| F3 | Medium | **`07_Test_Results.md` reports "20 fail".** Only 3 of those have no test (F2). The other 17 pass elsewhere (section 3). Its header also still says "the 50 cases". | Open, see C2 |
| F4 | Medium | **The Code Coverage Report's conclusion is not supported by its own tables.** It says all quality gates are met, services exceed 90%, and it cites a target of 80%. Its tables show `budgetService` 69.8%, `expenseService` 80.8%, `whatIfService` 57.3%, `askMoneyService` 39.6% and `statementImportService` 9.1%, and the project documents set no target. It also blames low figures on "batch scripts, seeders and PDF placeholders", but the low files are services. The cause is that it measures only the 68 plan cases. I reproduced its figures (65.9% of lines on today's `main`, against its 66.3%). The whole suite gives 97.2%. | Open, see C3 |
| F5 | Medium | **Three reports measure coverage on three different bases:** the Code Coverage Report (plan cases only, about 66%), the Branch Coverage Report (routes only, 87.4% of branches) and the Backend Code Coverage Report (whole suite, 97%). None says how it differs from the others, so they read as contradictions. | Open, see C3 |
| F6 | Medium | **The System Validation Report is out of date.** It says 5 of 6 system journeys pass and calls PDF export a backlog item (#54/#55). The System Test Report records 6 of 6, and PDF export is built and tested (UT_51). | Open, see C4 |
| F7 | Medium | **The Unit, Integration and System reports showed the rupee sign as "â‚¹"** (and similar damage to arrows and minus signs) in 37 lines. The result files themselves were clean. | **Fixed in this change.** Verified against the result files. |
| F8 | Low | Three result cells differ from the current result files: UT_27 and IT_09 (dates from a different run day) and UT_31 (still describes the old budget simulation, ₹37,500, not the planned-purchase one, ₹5,500). The Unit report also lists UT_34–UT_39 before UT_27. | Open, see C6 |
| F9 | Low | `Documents/09_Decisions_and_Deviations.md` still says savings goals are "Not built" (line 89), report export is "Not built" (line 93), the budget recommendation problem is open (line 88), and the results are "40 pass, 5 fail, 5 not run" (line 116). | Open, see C5 |
| F10 | Low | The Test Reports README lists 5 of the 10 reports. | **Fixed in this change** |

## 5. What is confirmed

- Every case the team ran and every case I re-ran passes. No failing test remains on `main` after F1.
- The security and data-isolation behaviours that are tested (SR01–SR10, per-user isolation, lockout, 2FA, the audit log) pass.
- Money arithmetic is exact: NFR04 matches a hand calculation to the paisa on 100 transactions.
- The financial health, budget cycle and recurring payment workflows pass end to end (see the #161 report).
- Backend line coverage is high (97.2%). The remaining gaps are listed in the Backend Code Coverage Report, the largest being statement import (quoted CSV fields and DD/MM/YYYY dates) and the SMTP mail path.

## 6. Conditions for final submission

| # | Condition | Suggested owner |
|---|---|---|
| C1 | Write tests for IT_12, IT_13 and ST_07, or record in `09_Decisions_and_Deviations.md` that they are deferred and why. IT_12 and IT_13 touch security and data isolation, so writing them is preferred. | Sanjay |
| C2 | Correct the `07_Test_Results.md` summary so cases tested outside the plan runner are not counted as failures, and fix its "50 cases" header. | Sanjay |
| C3 | Rewrite the Code Coverage Report conclusion so it matches its tables, state the basis (plan cases only) and cross-refer to the whole-suite figure. Remove the unsupported "target 80%". | Sanjay |
| C4 | Update the System Validation Report so ST_05 is passing in full and PDF export is no longer a backlog item. | Sanjay |
| C5 | Update lines 88, 89, 93 and 116 of `09_Decisions_and_Deviations.md`. | Team |
| C6 | Regenerate the Unit and Integration reports from the final result files, so that UT_27, UT_31 and IT_09 match. | Jahnavi or Sanjay |
| C7 | Run the browser tests on Firefox and WebKit once more before submission (they could not be run here). | Jahnavi |

## 7. Sign-off

The software is approved for submission on the strength of the evidence above, on the condition that C1–C7 are closed or explicitly accepted by all three team members.

| Role | Name | Date |
|---|---|---|
| QA reviewer | Dinesh Jadage | 6 November 2026 |
| Team confirmation of conditions | Sanjay Varma, Jahnavi R | pending |
