# Financial Health & Budget Cycles: End-to-End Validation

**Project:** Smart Expense & Budget Management System (Sec-D)
**Issue:** #161, Phase 2b.ii (System Validation)
**Execution date:** November 5, 2026
**Cases:** ST_04, IT_09, IT_10, with the budget-cycle cases IT_05, IT_06, IT_07 run alongside them
**Tester:** Dinesh Jadage
**Reference:** [07_Test_Results.md](../07_Test_Results.md), [System_Validation_Report.md](System_Validation_Report.md)
**Result:** 3 of 3 assigned cases passed, 0 failed. The related budget-cycle cases and module tests also passed.

---

## 1. Scope

This validates two workflows through the real API, with the real database and
row-level security in place:

1. **Financial health (FR18):** the score reacts when spending habits change, and says why.
2. **Budget cycles (FR16, FR17):** a recurring payment is created, reminded about before it
   is due, and stops reminding once it is marked paid.

The three assigned cases are in the table below. IT_05, IT_06 and IT_07 (budget alerts at 80% and
100%) were run alongside them because they share the budget and notification path.

## 2. Environment

| Item | Value |
|---|---|
| Host | Linux cloud container (not the macOS machine used for the earlier reports) |
| Node.js | v22.23.4 |
| PostgreSQL | 16.15 (the project's CI uses 17) |
| Migrations | 19 applied, up to `019_restore_price_rise_notification.sql` |
| Runner | `node:test` with `--test-concurrency=1`, Supertest through the real Express app |
| Source | `main` at `2232cf6` |

Command: `npm run test:plan --workspace backend`

## 3. Results for the assigned cases

| ID | Scenario | Expected | Actual result observed | Status |
|---|---|---|---|:---:|
| **ST_04** | Health score reacts to a change in habits (FR18) | Score drops and a short reason is shown | Score 100 (Excellent) → 10 (Needs improvement) after ₹15,000 of extra spending. Reasons: "Your expenses equalled or exceeded your income." "Spending exceeded your overall budget." | Pass |
| **IT_09** | Reminder before a due date (FR17) | A reminder is shown for the upcoming payment | A ₹499 payment due in 3 days created 1 reminder: "Payment of 499.00 is due on 2026-11-08." | Pass |
| **IT_10** | Reminders stop once marked paid | No reminder for that cycle | The cycle due 2026-11-06 was marked paid; checking reminders again created 0. | Pass |

### ST_04: score arithmetic checked by hand

Setup: income ₹15,000, overall budget ₹10,000, one expense of ₹5,000. Then three more
expenses of ₹5,000. The rules are in `financialHealthService.js`: the score starts at 50,
then savings and budget points are added.

| | Before | After |
|---|---|---|
| Expenses | ₹5,000 | ₹20,000 |
| Savings | ₹10,000 (66.7% of income, at least 20%) → +30 | −₹5,000 (expenses above income) → −25 |
| Budget use | 50% (within 80%) → +20 | 200% (over the budget) → −15 |
| Score | 50 + 30 + 20 = **100** | 50 − 25 − 15 = **10** |
| Rating | Excellent (80 or more) | Needs improvement (below 45) |

The observed 100 → 10 matches the hand calculation, and each reason shown to the user
corresponds to a rule that applied.

## 4. Related budget-cycle cases

| ID | Scenario | Actual result observed | Status |
|---|---|---|:---:|
| IT_05 | Alert at 80% of the budget | No alert at 75%. After a ₹600 expense (81%): "You have used at least 80% of your budget." | Pass |
| IT_06 | Alert at 100% of the budget | "Budget limit reached or exceeded."; remaining budget −₹300. | Pass |
| IT_07 | No duplicate alerts | Budget crossed, then two more expenses (₹50, ₹80): 1 over-budget notification in total. | Pass |

## 5. Module tests behind these workflows

All run on the same database; 91 tests, 91 passed, 0 failed.

| Test file | Tests | Passed |
|---|:---:|:---:|
| `financialHealth.test.js` | 11 | 11 |
| `recurringExpense.test.js` | 14 | 14 |
| `recurringExpenseRoutes.test.js` | 8 | 8 |
| `budget.test.js` | 18 | 18 |
| `budgetAlert.test.js` | 5 | 5 |
| `budgetPace.test.js` | 10 | 10 |
| `budgetRecommendation.test.js` | 5 | 5 |
| `notification.test.js` | 20 | 20 |

The financial health tests cover the boundaries: exactly 20% saved, one paisa under 20%,
spending exactly 80% of the budget, exactly the whole budget and one paisa over, a month
with no income, and a user seeing only their own money.

## 6. Notes and limitations

- Reminders for recurring payments are created when the dashboard is opened (there is no
  background job). This is a recorded team decision in `09_Decisions_and_Deviations.md`.
- These runs used PostgreSQL 16 on Linux. CI uses PostgreSQL 17, so the CI run is the
  reference for the final sign-off.
- `07_Test_Results.md` was not regenerated for this issue. The plan now also lists the ESP_*
  cases (run from `backend/test/issue164.test.js`) and the RWD_* cases (Playwright, in
  `frontend/tests/`), and `npm run test:plan` does not run those, so a regenerated file
  would wrongly count them as failed.
