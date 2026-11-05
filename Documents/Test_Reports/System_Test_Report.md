# System Test Report

**Project:** Smart Expense & Budget Management System

**Execution date:** 2026-11-05

## Overview

Records end-to-end system test results.

## Summary

| Metric | Count |
|---|---:|
| Total test cases | 6 |
| Passed | 6 |
| Failed | 0 |

## Detailed Results

| Test ID | Outcome | Actual Result | Notes |
|---|---|---|---|
| ST_01 | pass | With no session, all 5 data routes answered 401 with no financial data; the web app shows the login screen instead of the dashboard. |  |
| ST_02 | pass | User One using User Two's expense ID: edit 404, delete 404, own list empty; User Two's â‚¹9,000 expense is unchanged. |  |
| ST_03 | pass | Budget â‚¹5,000; remaining after each expense: â‚¹3,000 â†’ â‚¹1,000 â†’ âˆ’â‚¹500; the last entry raised "Budget limit reached or exceeded." |  |
| ST_04 | pass | Score 100 (Excellent) â†’ 10 (Needs improvement) after â‚¹15,000 of extra spending. Reasons: Your expenses equalled or exceeded your income. Spending exceeded your overall budget. |  |
| ST_05 | pass | Registration, login, income, expenses, budget, dashboard and CSV export succeeded. Dashboard spending: â‚¹2,500; CSV total: â‚¹2,500; remaining balance: â‚¹7,500. |  |
| ST_06 | pass | 5 expenses (total â‚¹5,000) saved; the API was killed and restarted; all 5 were still there, the total was unchanged and the user was still logged in. |  |

## Conclusion

This report records 6 passed and 0 failed test cases.

These results represent the test cases present in this execution result file. They do not establish that every case in the expanded test plan has been executed.
