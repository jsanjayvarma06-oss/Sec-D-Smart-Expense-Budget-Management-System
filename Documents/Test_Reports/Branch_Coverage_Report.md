# API Route Branch Coverage Report

**Project:** Smart Expense & Budget Management System
**Execution date:** November 5, 2026
**Scope:** Backend API route files

## 1. Objective

The objective of this report is to measure branch coverage across the backend API routes, identify uncovered decision paths, and record the additional tests introduced to improve coverage.

## 2. Coverage Summary

Coverage was measured using c8 with the Node.js test runner.

| Metric | Covered | Total | Coverage |
|---|---:|---:|---:|
| Statements | 2,026 | 2,109 | 96.06% |
| Branches | 339 | 388 | 87.37% |
| Functions | 31 | 31 | 100% |

A total of 49 branch outcomes remain uncovered.

## 3. Route-wise Branch Coverage

| API Route | Branches Covered | Total Branches | Coverage |
|---|---:|---:|---:|
| adminRoutes.js | 53 | 67 | 79.10% |
| analyticsRoutes.js | 7 | 7 | 100% |
| authRoutes.js | 51 | 57 | 89.47% |
| budgetRoutes.js | 31 | 34 | 91.17% |
| categoryRoutes.js | 29 | 31 | 93.54% |
| expenseRoutes.js | 37 | 40 | 92.50% |
| financialHealthRoutes.js | 7 | 7 | 100% |
| forecastRoutes.js | 3 | 4 | 75.00% |
| incomeRoutes.js | 15 | 17 | 88.23% |
| insightRoutes.js | 11 | 13 | 84.61% |
| notificationRoutes.js | 12 | 13 | 92.30% |
| recurringExpenseRoutes.js | 23 | 26 | 88.46% |
| reportRoutes.js | 35 | 45 | 77.77% |
| savingsGoalRoutes.js | 16 | 18 | 88.88% |
| whatIfRoutes.js | 9 | 9 | 100% |
| **Total** | **339** | **388** | **87.37%** |

## 4. Additional Test Coverage

The following tests were added to exercise additional API route branches:

- Report routes: tested empty expense-list and pagination scenarios.
- Savings goal routes: tested invalid UUID input and a nonexistent goal returning 404.
- Two-factor authentication: tested invalid backup-code regeneration input.

These tests improved coverage of validation and error-handling paths.

## 5. Remaining Coverage Gaps

The coverage report shows that 49 branch outcomes remain uncovered.

Routes with notable remaining gaps include:

- adminRoutes.js: 14 uncovered branch outcomes.
- reportRoutes.js: 10 uncovered branch outcomes.
- authRoutes.js: 6 uncovered branch outcomes.
- budgetRoutes.js, expenseRoutes.js and recurringExpenseRoutes.js: 3 uncovered branch outcomes each.
- Other routes have smaller remaining gaps, as shown in the route-wise table.

Some error-handling paths, including certain catch branches, remain uncovered. These paths require further investigation and targeted tests.

## 6. Test Execution

The complete backend test suite was executed using the Node.js test runner and c8.

| Metric | Result |
|---|---:|
| Test cases passed | 527 |
| Test cases failed | 0 |
| Test suites | 93 |
| Branch coverage | 87.37% |
| Statement coverage | 96.06% |
| Function coverage | 100% |

All 527 executed tests passed.

## 7. Conclusion

The API route branch coverage improved from 85.18% to 87.37%, an increase of 2.19 percentage points. Statement coverage improved from 94.92% to 96.06%.

All functions in the measured API routes were covered. However, 49 branch outcomes remain uncovered. Therefore, branch coverage has improved, but complete branch coverage has not yet been achieved.

Further targeted tests can be added for the remaining validation and error-handling paths without changing production code solely to increase the coverage percentage.
