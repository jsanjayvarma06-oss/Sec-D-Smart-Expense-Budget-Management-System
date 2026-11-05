# Unit Test Report

**Project:** Smart Expense & Budget Management System

**Execution date:** 2026-11-05

## Overview

Records unit test execution results.

## Summary

| Metric | Count |
|---|---:|
| Total test cases | 50 |
| Passed | 50 |
| Failed | 0 |

## Detailed Results

| Test ID | Outcome | Actual Result | Notes |
|---|---|---|---|
| UT_01 | pass | Account created (201). As in UC-01, the app then asks the user to log in; after logging in the dashboard loads for "Test User". |  |
| UT_02 | pass | Login succeeded (200) with an HttpOnly session cookie; the dashboard data loads for the logged-in user. |  |
| UT_03 | pass | Login refused (401) with "Invalid email or password"; no session cookie set. |  |
| UT_04 | pass | Registration refused (409) with "An account with this email already exists". Same meaning as the planned "Email already registered" but different wording. |  |
| UT_05 | pass | Not submitted (400). Email: "Enter a valid email address"; Password: "Password must contain at least 8 characters". The form also marks both fields required in the browser. |  |
| UT_06 | pass | Stored value is a bcrypt hash (cost 12, starts "$2b$12$â€¦"); the password is not readable. |  |
| UT_07 | pass | Expense of â‚¹450 (Food, today) saved and shown first in the expense list. |  |
| UT_08 | pass | Refused (400) with "Amount must be greater than zero". |  |
| UT_09 | pass | Refused (400) with "Expense date cannot be in the future". |  |
| UT_10 | pass | Amount changed â‚¹450 â†’ â‚¹600; the list shows â‚¹600 and the month's total went from â‚¹450 to â‚¹600. |  |
| UT_11 | pass | Deleted (204); the list is empty and the month's total is â‚¹0. |  |
| UT_12 | pass | Income of â‚¹15,000 (Part-time job) saved; the month's income and available balance (savings) both rose by â‚¹15,000. |  |
| UT_13 | pass | An expense for "Metro Station" with no category was saved (201) under Transport, suggested from the merchant name; when the user picked Food themselves, that was kept. |  |
| UT_14 | pass | Monthly budget of â‚¹10,000 saved for 2026-11 and returned by the dashboard's remaining-budget data. |  |
| UT_15 | pass | 0 and -50 both refused (400) with "Budget must be greater than zero". |  |
| UT_16 | pass | Food limit of â‚¹3,000 saved and tracked as its own row beside the â‚¹10,000 monthly budget. |  |
| UT_17 | pass | Budget â‚¹10,000, spent â‚¹2,500: remaining shows â‚¹7,500. |  |
| UT_18 | pass | Category totals Food â‚¹1,200, Travel â‚¹800, Bills â‚¹2,000 match the expense list (total â‚¹4,000). This checks the data behind the pie chart; the chart itself is card #41. |  |
| UT_19 | pass | One total per month for the last 3 months: â‚¹3,000, â‚¹4,500, â‚¹6,000, each correct. This checks the data behind the line chart; the chart itself is card #40. |  |
| UT_20 | pass | â‚¹9,000 flagged for review: "Amount is significantly higher than your recent spending in this category" (recent average â‚¹400). |  |
| UT_21 | pass | â‚¹350 saved normally with no flag. |  |
| UT_22 | pass | Forecast â‚¹8,500 for this month, based on 2026-08: â‚¹8,000, 2026-09: â‚¹8,500, 2026-10: â‚¹9,000. |  |
| UT_23 | pass | No forecast; message: "At least 3 months of spending history are required". |  |
| UT_24 | pass | Created "Emergency Fund" with target â‚¹10,000 and saved amount â‚¹2,500. Progress is 25% and remaining amount is â‚¹7,500. The goal also appears in the savings-goals list. |  |
| UT_25 | pass | Average monthly savings is â‚¹6,000. With â‚¹15,000 remaining, the estimated completion time is 3 months. |  |
| UT_26 | pass | The goal has â‚¹8,000 remaining, but there is no positive savings history. The system correctly displays "Your goal cannot currently be estimated at your existing saving rate." instead of inventing a completion date. |  |
| UT_34 | pass | Updated the goal name and saved amount. New progress is 50% with â‚¹5,000 remaining. |  |
| UT_35 | pass | Savings goal deleted successfully and no longer appears in the goal list. |  |
| UT_36 | pass | Another user could neither update nor delete the goal. The original owner still has access to it. |  |
| UT_37 | pass | The fully funded goal correctly shows 0 months remaining and confirms that the savings goal has been reached. |  |
| UT_38 | pass | Increasing the target amount recalculated the estimate from 3 to 4 months. |  |
| UT_39 | pass | Increasing average monthly savings from â‚¹6,000 to â‚¹8,000 recalculated the completion estimate from 3 months to 2 months. |  |
| UT_27 | pass | Monthly Rent of â‚¹6,000 saved and listed with next due date 2026-11-05. |  |
| UT_28 | pass | First run created 1, a repeat in the same cycle created 0: exactly one entry. |  |
| UT_29 | pass | Remaining after purchase â‚¹5,500; affordable. |  |
| UT_30 | pass | Shortfall â‚¹32,500; not affordable. |  |
| UT_31 | pass | Simulation ran (simulated remaining â‚¹37,500); the expense list still has 1 entry and the real remaining budget stayed â‚¹7,500. |  |
| UT_32 | pass | CSV report downloaded successfully for 2026-11, containing the test expense of â‚¹600 with its merchant, category and note. |  |
| UT_33 | pass | The export returned HTTP 204 with no file because the selected month has no expenses. |  |
| UT_40 | pass | Password reset link requested and email sent to outbox; token reset password successfully and old password rejected. |  |
| UT_41 | pass | 5 consecutive wrong passwords locked account for 15 minutes; 6th attempt rejected with 429 ACCOUNT_LOCKED even with correct password. |  |
| UT_42 | pass | Registered and unregistered accounts return identical 401 error message ("Invalid email or password") with balanced hash comparison times. |  |
| UT_43 | pass | 2FA setup generated base32 TOTP secret, otpauth URI, and QR code data URL. |  |
| UT_44 | pass | 2FA enrolled with 10 single-use backup codes; login required 2FA verification and backup code completed authentication. |  |
| UT_45 | pass | Non-admin request rejected with 403 Forbidden; admin user granted 200 OK access to user administration. |  |
| UT_46 | pass | Security events recorded in database and aggregated correctly by the security monitor endpoint. |  |
| UT_47 | pass | Admin action logged to append-only audit trail containing timestamp, admin ID, and sanitized action metadata. |  |
| UT_48 | pass | Admin successfully unlocked locked user account and cleared all active sessions across devices. |  |
| UT_49 | pass | Query "How much did I spend on Food?" returned accurate parsed answer: "You spent â‚¹350.00 on Food across 1 transaction in November 2026.". |  |
| UT_50 | pass | Receipt text parser extracted amount â‚¹280.00, date 2026-10-28, merchant "STARBUCKS COFFEE", and matched Food category. |  |

## Conclusion

This report records 50 passed and 0 failed test cases.

These results represent the test cases present in this execution result file. They do not establish that every case in the expanded test plan has been executed.
