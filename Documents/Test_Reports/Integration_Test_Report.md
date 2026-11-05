# Integration Test Report

**Project:** Smart Expense & Budget Management System

**Execution date:** 2026-11-05

## Overview

Records integration tests covering interactions between application modules.

## Summary

| Metric | Count |
|---|---:|
| Total test cases | 11 |
| Passed | 11 |
| Failed | 0 |

## Detailed Results

| Test ID | Outcome | Actual Result | Notes |
|---|---|---|---|
| IT_01 | pass | User One sees only â‚¹1,200 (1 expense); User Two sees only â‚¹9,000. Neither total includes the other account. |  |
| IT_02 | pass | After 16 idle minutes (timeout 15) the next request was refused (401) and the session deleted; the web app then returns to the login screen with "Your session has expired". |  |
| IT_03 | pass | Remaining budget went â‚¹8,000 â†’ â‚¹7,500; the dashboard reloads it straight after saving. |  |
| IT_04 | pass | Food total grew â‚¹700 â†’ â‚¹1,000; the chart total â‚¹1,000 equals the expense list total. |  |
| IT_05 | pass | No alert at 75%. After the â‚¹600 expense (81%): "You have used at least 80% of your budget." |  |
| IT_06 | pass | Over-budget alert: "Budget limit reached or exceeded."; remaining budget âˆ’â‚¹300. |  |
| IT_07 | pass | Budget crossed, then two more expenses (â‚¹50, â‚¹80) with alerts checked each time: 1 over-budget notification in total. |  |
| IT_08 | pass | Suggested Food â‚¹5,000, Transport â‚¹4,000; total â‚¹9,000 â‰¤ monthly income â‚¹15,000. |  |
| IT_09 | pass | Payment due in 3 days: reminder created, "Payment of 499.00 is due on 2026-11-08." |  |
| IT_10 | pass | Payment due 2026-11-06 marked paid; checking reminders again created 0. |  |
| IT_11 | pass | The note is stored as plain text and returned as JSON. The React UI shows it as text (no raw HTML insertion anywhere), so the script tag is displayed, not run. |  |

## Conclusion

This report records 11 passed and 0 failed test cases.

These results represent the test cases present in this execution result file. They do not establish that every case in the expanded test plan has been executed.
