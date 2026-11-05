# Backend Code Coverage Report

**Project:** Smart Expense & Budget Management System (Sec-D)
**Issue:** #162, Phase 2b.iii (Code Coverage)
**Execution date:** November 5, 2026
**Scope:** backend services and the database layer (`backend/src/services/`, `backend/src/db/`), with the rest of `backend/src/` for context
**Tester:** Dinesh Jadage
**Result:** 529 of 529 tests passed. Line coverage of the backend source is 97.0%, and of the services 97.8%.

---

## 1. Method

Coverage was measured with the test runner built into Node.js, so no new dependency
was added. It runs the whole backend suite (`backend/test/**/*.test.js`), the unit,
integration and system plan cases included, and counts only files under `backend/src/`.

```
cd backend
node --env-file-if-exists=.env.test --test --test-concurrency=1 \
  --experimental-test-coverage --test-coverage-include="src/**/*.js" \
  "test/**/*.test.js"
```

Add `--test-reporter=lcov --test-reporter-destination=lcov.info` to also write an lcov
file. The figures below were read from that file.

| Item | Value |
|---|---|
| Node.js | v22.23.4 |
| PostgreSQL | 16.15 on Linux (the project's CI uses 17) |
| Database | A new, empty test database, as in CI, so the migration runner is exercised (19 migrations applied) |
| Tests run | 529 (95 suites): 529 passed, 0 failed, 0 cancelled |

The repo has no `models` folder. Data access lives in the services and in `src/db/`
(connection pool, per-user scope, migration runner), so those two are the "services and
models" this issue covers.

## 2. Results by area

| Area | Files | Lines | Functions | Branches |
|---|:---:|:---:|:---:|:---:|
| `services/` | 40 | 97.8% (4670/4773) | 98.5% (259/263) | 88.1% (727/825) |
| `db/` | 3 | 90.5% (105/116) | 70.0% (7/10) | 80.0% (16/20) |
| `middleware/` | 6 | 98.9% (186/188) | 93.3% (14/15) | 93.2% (55/59) |
| `routes/` | 15 | 95.3% (2010/2109) | 89.1% (115/129) | 85.2% (305/358) |
| `utils/` | 3 | 98.0% (98/100) | 100.0% (14/14) | 92.3% (36/39) |
| `app.js`, `server.js`, `config.js` | 2 | 95.0% (192/202) | 100.0% (5/5) | 53.8% (7/13) |
| **All of `src/`** | **69** | **97.0%** (7261/7488) | **95.0%** (414/436) | **87.2%** (1146/1314) |

The project documents set no coverage target, so there is no pass/fail threshold here.
Line coverage is what the tests executed; it does not by itself show that the assertions
are right.

## 3. Services and database layer, file by file

| File | Lines | Functions | Branches |
|---|:---:|:---:|:---:|
| `db/migrate.js` | 80.0% | 50.0% | 71.4% |
| `db/pool.js` | 100.0% | 100.0% | 80.0% |
| `db/userScope.js` | 100.0% | 100.0% | 87.5% |
| `services/adminCategoryService.js` | 100.0% | 100.0% | 96.6% |
| `services/adminService.js` | 100.0% | 100.0% | 80.0% |
| `services/adminUsageService.js` | 100.0% | 100.0% | 100.0% |
| `services/analyticsService.js` | 98.4% | 100.0% | 93.3% |
| `services/announcementService.js` | 96.9% | 100.0% | 75.0% |
| `services/anomalyDetectionService.js` | 100.0% | 100.0% | 100.0% |
| `services/askMoneyService.js` | 100.0% | 100.0% | 90.3% |
| `services/auditLogService.js` | 100.0% | 100.0% | 92.3% |
| `services/authSchemas.js` | 100.0% | 100.0% | 100.0% |
| `services/budgetAlertService.js` | 96.3% | 100.0% | 83.3% |
| `services/budgetRecommendationService.js` | 100.0% | 100.0% | 100.0% |
| `services/budgetSchemas.js` | 100.0% | 100.0% | 100.0% |
| `services/budgetService.js` | 99.4% | 100.0% | 89.4% |
| `services/categorySchemas.js` | 100.0% | 100.0% | 100.0% |
| `services/categoryService.js` | 100.0% | 100.0% | 95.7% |
| `services/expenseSchemas.js` | 100.0% | 100.0% | 100.0% |
| `services/expenseService.js` | 100.0% | 100.0% | 95.2% |
| `services/financialHealthService.js` | 100.0% | 100.0% | 100.0% |
| `services/forecastService.js` | 100.0% | 100.0% | 100.0% |
| `services/incomeSchemas.js` | 100.0% | 100.0% | 100.0% |
| `services/incomeService.js` | 100.0% | 100.0% | 100.0% |
| `services/loginProtection.js` | 100.0% | 100.0% | 100.0% |
| `services/mailService.js` | 75.9% | 100.0% | 40.0% |
| `services/merchantCategoryService.js` | 100.0% | 100.0% | 100.0% |
| `services/notificationService.js` | 98.9% | 100.0% | 94.1% |
| `services/passwordResetService.js` | 97.9% | 100.0% | 88.9% |
| `services/passwordService.js` | 94.7% | 100.0% | 91.7% |
| `services/recurringExpenseService.js` | 99.2% | 100.0% | 89.3% |
| `services/reportService.js` | 100.0% | 100.0% | 100.0% |
| `services/savingsGoalSchemas.js` | 93.2% | 50.0% | 100.0% |
| `services/savingsGoalService.js` | 100.0% | 100.0% | 87.0% |
| `services/securityMonitorService.js` | 98.7% | 100.0% | 93.8% |
| `services/sessionService.js` | 100.0% | 100.0% | 100.0% |
| `services/statementImportService.js` | 79.3% | 87.5% | 67.6% |
| `services/subscriptionService.js` | 100.0% | 95.2% | 93.6% |
| `services/systemHealthService.js` | 96.7% | 100.0% | 89.6% |
| `services/totp.js` | 100.0% | 100.0% | 94.4% |
| `services/twoFactorService.js` | 99.0% | 100.0% | 76.3% |
| `services/userManagementService.js` | 100.0% | 100.0% | 46.7% |
| `services/whatIfService.js` | 100.0% | 100.0% | 91.3% |

## 4. Modules owned by Dinesh

| File | Lines | Branches | Notes |
|---|:---:|:---:|---|
| `financialHealthService.js` | 100.0% | 100.0% | Every score band, rating and input check is exercised. |
| `whatIfService.js` | 100.0% | 91.3% | Budget and planned-purchase modes, including input checks and an unknown category. |
| `budgetRecommendationService.js` | 100.0% | 100.0% | Includes the "history but no income" case. |
| `forecastService.js` | 100.0% | 100.0% | |
| `savingsGoalService.js` | 100.0% | 87.0% | |
| `recurringExpenseService.js` | 99.2% | 89.3% | The one uncovered path is the guard against an unsupported cycle, which the API schema never lets through. |
| `savingsGoalSchemas.js` | 93.2% | 100.0% | No test sends a target date, so the check that it is a real calendar date never runs. |

Before this issue, three of these files had uncovered lines: `financialHealthService.js`
(94.6% lines), `whatIfService.js` (92.7% lines, 66.7% branches) and
`budgetRecommendationService.js` (93.4% lines). They were the savings band under 10%, the
Fair rating, the input checks on month and amounts, an unknown category in a planned
purchase, and a user with spending history but no income.
`backend/test/serviceEdgeCases.test.js` adds 7 tests for them.

## 5. Gaps found outside this scope

These are not Dinesh's modules and no code was changed for them.

| File | Lines | What no test reaches |
|---|:---:|---|
| `db/migrate.js` | 80.0% | Rolling back a migration that fails, and the command-line entry point (`npm run migrate`). |
| `services/mailService.js` | 75.9% | Sending through a real SMTP server (`SMTP_URL`), and the warning in production when it is not set. The mail outbox path is tested. |
| `services/statementImportService.js` | 79.3% | CSV fields wrapped in quotes, and dates written as DD/MM/YYYY or DD-MM-YYYY. No test sends either. |
| `services/userManagementService.js` | 100.0% lines, 46.7% branches | Every line runs, but some conditions are only tested one way. |

The statement import gap is the one worth a test, because real bank CSV files often
quote fields and use DD/MM/YYYY dates.

## 6. Notes and limitations

- These runs used PostgreSQL 16. CI uses 17, so the CI run is the reference for the final sign-off.
- Branch coverage (87.2% overall) is lower than line coverage. Many of the missed branches
  are defaults and guards that the routes already validate before the service is called.
- Issue #157 (instrumenting the suites and generating coverage reports) is separate, so no
  script was added to `package.json` here, to avoid clashing with it.
- `07_Test_Results.md` was not regenerated, for the reason given in the #161 report.
