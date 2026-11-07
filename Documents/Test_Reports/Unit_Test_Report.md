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
| UT_06 | pass | Stored value is a bcrypt hash (cost 12, starts "$2b$12$…"); the password is not readable. |  |
| UT_07 | pass | Expense of ₹450 (Food, today) saved and shown first in the expense list. |  |
| UT_08 | pass | Refused (400) with "Amount must be greater than zero". |  |
| UT_09 | pass | Refused (400) with "Expense date cannot be in the future". |  |
| UT_10 | pass | Amount changed ₹450 → ₹600; the list shows ₹600 and the month's total went from ₹450 to ₹600. |  |
| UT_11 | pass | Deleted (204); the list is empty and the month's total is ₹0. |  |
| UT_12 | pass | Income of ₹15,000 (Part-time job) saved; the month's income and available balance (savings) both rose by ₹15,000. |  |
| UT_13 | pass | An expense for "Metro Station" with no category was saved (201) under Transport, suggested from the merchant name; when the user picked Food themselves, that was kept. |  |
| UT_14 | pass | Monthly budget of ₹10,000 saved for 2026-11 and returned by the dashboard's remaining-budget data. |  |
| UT_15 | pass | 0 and -50 both refused (400) with "Budget must be greater than zero". |  |
| UT_16 | pass | Food limit of ₹3,000 saved and tracked as its own row beside the ₹10,000 monthly budget. |  |
| UT_17 | pass | Budget ₹10,000, spent ₹2,500: remaining shows ₹7,500. |  |
| UT_18 | pass | Category totals Food ₹1,200, Travel ₹800, Bills ₹2,000 match the expense list (total ₹4,000). This checks the data behind the pie chart; the chart itself is card #41. |  |
| UT_19 | pass | One total per month for the last 3 months: ₹3,000, ₹4,500, ₹6,000, each correct. This checks the data behind the line chart; the chart itself is card #40. |  |
| UT_20 | pass | ₹9,000 flagged for review: "Amount is significantly higher than your recent spending in this category" (recent average ₹400). |  |
| UT_21 | pass | ₹350 saved normally with no flag. |  |
| UT_22 | pass | Forecast ₹8,500 for this month, based on 2026-08: ₹8,000, 2026-09: ₹8,500, 2026-10: ₹9,000. |  |
| UT_23 | pass | No forecast; message: "At least 3 months of spending history are required". |  |
| UT_24 | pass | Created "Emergency Fund" with target ₹10,000 and saved amount ₹2,500. Progress is 25% and remaining amount is ₹7,500. The goal also appears in the savings-goals list. |  |
| UT_25 | pass | Average monthly savings is ₹6,000. With ₹15,000 remaining, the estimated completion time is 3 months. |  |
| UT_26 | pass | The goal has ₹8,000 remaining, but there is no positive savings history. The system correctly displays "Your goal cannot currently be estimated at your existing saving rate." instead of inventing a completion date. |  |
| UT_34 | pass | Updated the goal name and saved amount. New progress is 50% with ₹5,000 remaining. |  |
| UT_35 | pass | Savings goal deleted successfully and no longer appears in the goal list. |  |
| UT_36 | pass | Another user could neither update nor delete the goal. The original owner still has access to it. |  |
| UT_37 | pass | The fully funded goal correctly shows 0 months remaining and confirms that the savings goal has been reached. |  |
| UT_38 | pass | Increasing the target amount recalculated the estimate from 3 to 4 months. |  |
| UT_39 | pass | Increasing average monthly savings from ₹6,000 to ₹8,000 recalculated the completion estimate from 3 months to 2 months. |  |
| UT_27 | pass | Monthly Rent of ₹6,000 saved and listed with next due date 2026-11-05. |  |
| UT_28 | pass | First run created 1, a repeat in the same cycle created 0: exactly one entry. |  |
| UT_29 | pass | Remaining after purchase ₹5,500; affordable. |  |
| UT_30 | pass | Shortfall ₹32,500; not affordable. |  |
| UT_31 | pass | Simulation ran (simulated remaining ₹37,500); the expense list still has 1 entry and the real remaining budget stayed ₹7,500. |  |
| UT_32 | pass | CSV report downloaded successfully for 2026-11, containing the test expense of ₹600 with its merchant, category and note. |  |
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
| UT_49 | pass | Query "How much did I spend on Food?" returned accurate parsed answer: "You spent ₹350.00 on Food across 1 transaction in November 2026.". |  |
| UT_50 | pass | Receipt text parser extracted amount ₹280.00, date 2026-10-28, merchant "STARBUCKS COFFEE", and matched Food category. |  |

## Conclusion

This report records 50 passed and 0 failed test cases.

These results represent the test cases present in this execution result file. They do not establish that every case in the expanded test plan has been executed.
