# Test Results

Smart Expense & Budget Management System. Results for the 50 cases in
`04_Test_Plan.pdf`, plus the NFR04 calculation check.

**Run:** 2026-10-26, Node.js v24.12.0, PostgreSQL 17, through the real API
(`npm run test:plan -w backend`). Each case is an automated test named after its ID in
`backend/test/plan/`. The Actual Result column is what that test observed in this run.

As the test plan says, cases for features that are not built yet are not run
and are not counted as passing.

## Summary

| Result | Cases |
|---|---|
| Pass | 40 |
| Fail (known gap, tracked on the board) | 5 |
| Fail | 0 |
| Not run (feature not built) | 5 |
| **Total** | **50** |

## Unit tests (UT)

| ID | Module | Description | Expected Results | Actual Result | Test Result |
|---|---|---|---|---|---|
| UT_01 | User Registration & Login | Test registration with valid details | Account is created and the user is taken to the dashboard | Account created (201). As in UC-01, the app then asks the user to log in; after logging in the dashboard loads for "Test User". | Pass |
| UT_02 | User Registration & Login | Test login with a valid account | Login succeeds and the dashboard is displayed | Login succeeded (200) with an HttpOnly session cookie; the dashboard data loads for the logged-in user. | Pass |
| UT_03 | User Registration & Login | Test login with a wrong password | Login is refused and the message "Invalid email or password" is shown | Login refused (401) with "Invalid email or password"; no session cookie set. | Pass |
| UT_04 | User Registration & Login | Test registration with a duplicate email | Registration is refused with the message "Email already registered" | Registration refused (409) with "An account with this email already exists". Same meaning as the planned "Email already registered" but different wording. | Pass |
| UT_05 | User Registration & Login | Test that required fields are validated | Form is not submitted and both fields are marked as required | Not submitted (400). Email: "Enter a valid email address"; Password: "Password must contain at least 8 characters". The form also marks both fields required in the browser. | Pass |
| UT_06 | User Registration & Login | Check that the password is not stored in plain text (SR02) | The stored value is a hash, the original password is not readable | Stored value is a bcrypt hash (cost 12, starts "$2b$12$…"); the password is not readable. | Pass |
| UT_07 | Income & Expense Records | Test adding a valid expense | Expense is saved and appears at the top of the expense list | Expense of ₹450 (Food, today) saved and shown first in the expense list. | Pass |
| UT_08 | Income & Expense Records | Test adding an expense with a negative amount | Entry is refused with the message "Amount must be greater than zero" | Refused (400) with "Amount must be greater than zero". | Pass |
| UT_09 | Income & Expense Records | Test adding an expense with a future date | Entry is refused with the message "Date cannot be in the future" | Refused (400) with "Expense date cannot be in the future". | Pass |
| UT_10 | Income & Expense Records | Test editing an existing expense | The updated amount is shown in the list and the totals change accordingly | Amount changed ₹450 → ₹600; the list shows ₹600 and the month's total went from ₹450 to ₹600. | Pass |
| UT_11 | Income & Expense Records | Test deleting an expense | Entry is removed from the list and no longer counted in the totals | Deleted (204); the list is empty and the month's total is ₹0. | Pass |
| UT_12 | Income & Expense Records | Test adding an income record | Income is saved and the available balance goes up by the same amount | Income of ₹15,000 (Part-time job) saved; the month's income and available balance (savings) both rose by ₹15,000. | Pass |
| UT_13 | Income & Expense Records | Test the category suggestion (FR05) | A category such as Travel is suggested, and the user can still change it | expense without a category was refused: 400 "Invalid input: expected string, received undefined" | Fail (known gap) |
| UT_14 | Budget Management | Test setting a monthly budget | The budget is saved and shown on the dashboard for the current month | Monthly budget of ₹10,000 saved for 2026-10 and returned by the dashboard's remaining-budget data. | Pass |
| UT_15 | Budget Management | Test setting a zero or negative budget | The value is refused with a message asking for an amount above zero | 0 and -50 both refused (400) with "Budget must be greater than zero". | Pass |
| UT_16 | Budget Management | Test setting a category-wise budget | The Food limit is saved and tracked separately from the monthly budget | Food limit of ₹3,000 saved and tracked as its own row beside the ₹10,000 monthly budget. | Pass |
| UT_17 | Budget Management | Test the remaining budget calculation (FR08) | Remaining budget shows 7500 | Budget ₹10,000, spent ₹2,500: remaining shows ₹7,500. | Pass |
| UT_18 | Analytics & Charts | Test the pie chart totals by category (FR10) | Each slice matches the category total in the expense list | Category totals Food ₹1,200, Travel ₹800, Bills ₹2,000 match the expense list (total ₹4,000). This checks the data behind the pie chart; the chart itself is card #41. | Pass |
| UT_19 | Analytics & Charts | Test the monthly trend line chart | A line chart is drawn with one point per month and correct monthly totals | One total per month for the last 3 months: ₹3,000, ₹4,500, ₹6,000, each correct. This checks the data behind the line chart; the chart itself is card #40. | Pass |
| UT_20 | Anomaly Detection | Test that an unusual expense is flagged (FR11) | The entry is flagged for review with a note asking the user to confirm the amount | ₹9,000 flagged for review: "Amount is significantly higher than your recent spending in this category" (recent average ₹400). | Pass |
| UT_21 | Anomaly Detection | Test that a normal expense is not flagged | The entry is saved normally with no flag | ₹350 saved normally with no flag. | Pass |
| UT_22 | Prediction | Test the monthly expenditure forecast (FR12) | A forecast is shown in a sensible range with the months it is based on | Forecast ₹8,500 for this month, based on 2026-07: ₹8,000, 2026-08: ₹8,500, 2026-09: ₹9,000. | Pass |
| UT_23 | Prediction | Test the forecast for a new account with no history | No forecast is shown, instead a message saying more history is needed | No forecast; message: "At least 3 months of spending history are required". | Pass |
| UT_24 | Savings Goals | Test creating a savings goal (FR14) | The goal is created and shows 0% progress | Savings goals are not built yet (#50). | Not run (not built) |
| UT_25 | Savings Goals | Test the time-to-goal estimate (FR15) | An estimate of about 10 months is shown | Time-to-goal estimate is not built yet (#51). | Not run (not built) |
| UT_26 | Savings Goals | Test the estimate when nothing is being saved | No number is shown, instead a message that the goal cannot be reached at the current rate | Time-to-goal estimate is not built yet (#51). | Not run (not built) |
| UT_27 | Recurring Expenses | Test creating a recurring expense (FR16) | The recurring expense is saved and listed with its next due date | Monthly Rent of ₹6,000 saved and listed with next due date 2026-10-26. | Pass |
| UT_28 | Recurring Expenses | Test that a recurring expense is not created twice in one cycle | Exactly one entry is created for the new cycle, not two | First run created 1, a repeat in the same cycle created 0: exactly one entry. | Pass |
| UT_29 | What-If Simulator | Test simulating an affordable purchase (FR19) | The result shows the budget left after the purchase and marks it as affordable | planned purchase refused: 400 "Provide a valid month, proposed budget, and proposed income" | Fail (known gap) |
| UT_30 | What-If Simulator | Test simulating a purchase the user cannot afford | The result warns that the purchase goes past the budget and shows the shortfall | planned purchase refused: 400 "Provide a valid month, proposed budget, and proposed income" | Fail (known gap) |
| UT_31 | What-If Simulator | Check that a simulation is not saved as a real expense | No new expense appears in the list and the remaining budget is unchanged | Simulation ran (simulated remaining ₹37,500); the expense list still has 1 entry and the real remaining budget stayed ₹7,500. | Pass |
| UT_32 | Export Reports | Test exporting a report (FR20) | A file downloads with figures matching the dashboard for that month | Report export is not built yet (#54 CSV, #55 PDF). | Not run (not built) |
| UT_33 | Export Reports | Test exporting a month with no data | The app shows a message that there is nothing to export instead of an empty file | Report export is not built yet (#54 CSV, #55 PDF). | Not run (not built) |

## Integration tests (IT)

| ID | Module | Description | Expected Results | Actual Result | Test Result |
|---|---|---|---|---|---|
| IT_01 | Login + Dashboard | Check that the dashboard loads the logged-in user's own data | Each user sees only their own totals, no data from the other account | User One sees only ₹1,200 (1 expense); User Two sees only ₹9,000. Neither total includes the other account. | Pass |
| IT_02 | Login + Session | Check that an idle session expires (SR07) | The session ends and the user is sent back to the login page | After 16 idle minutes (timeout 15) the next request was refused (401) and the session deleted; the web app then returns to the login screen with "Your session has expired". | Pass |
| IT_03 | Expense + Budget | Check that adding an expense updates the remaining budget | Remaining budget drops from 8000 to 7500 without needing a page refresh | Remaining budget went ₹8,000 → ₹7,500; the dashboard reloads it straight after saving. | Pass |
| IT_04 | Expense + Charts | Check that a new expense shows up in the charts | The Food slice grows and the chart total matches the expense list | Food total grew ₹700 → ₹1,000; the chart total ₹1,000 equals the expense list total. | Pass |
| IT_05 | Budget + Alerts | Check that the warning alert fires at the threshold (FR09) | A warning alert is shown saying the user is close to the budget limit | No alert at 75%. After the ₹600 expense (81%): "You have used at least 80% of your budget." | Pass |
| IT_06 | Budget + Alerts | Check the alert when the budget is crossed | An over-budget alert is shown and the remaining budget is displayed as -300 | Over-budget alert: "Budget limit reached or exceeded."; remaining budget −₹300. | Pass |
| IT_07 | Budget + Notification | Check that only one alert is sent per threshold crossing | No duplicate alerts are sent for the same threshold | Budget crossed, then two more expenses (₹50, ₹80) with alerts checked each time: 1 over-budget notification in total. | Pass |
| IT_08 | Prediction + Recommendation | Check the recommended budget stays within income (FR13) | A category-wise suggestion is shown and the total does not exceed the income | suggested Food ₹5,000, Transport ₹35,500 (total ₹40,500) against a monthly income of ₹15,000; the API reports monthly income as ₹45,000 | Fail (known gap) |
| IT_09 | Recurring + Reminder | Check the reminder before a due date (FR17) | A reminder is shown for the upcoming payment | Payment due in 3 days: reminder created, "Payment of 499.00 is due on 2026-10-29." | Pass |
| IT_10 | Recurring + Reminder | Check that reminders stop once the payment is marked paid | The reminder no longer appears for that cycle | Payment due 2026-10-27 marked paid; checking reminders again created 0. | Pass |
| IT_11 | Input Validation | Check that unsafe input is rejected (SR05) | The input is rejected or escaped, and nothing is executed when the entry is opened | The note is stored as plain text and returned as JSON. The React UI shows it as text (no raw HTML insertion anywhere), so the script tag is displayed, not run. | Pass |

## System tests (ST)

| ID | Module | Description | Expected Results | Actual Result | Test Result |
|---|---|---|---|---|---|
| ST_01 | End to end | Check that a user cannot reach data pages without logging in (SR01) | The app redirects to login and shows no financial data | With no session, all 5 data routes answered 401 with no financial data; the web app shows the login screen instead of the dashboard. | Pass |
| ST_02 | End to end | Check a user cannot open another user's expense (SR04) | The request is refused and no data from the other account is returned | User One using User Two's expense ID: edit 404, delete 404, own list empty; User Two's ₹9,000 expense is unchanged. | Pass |
| ST_03 | End to end | Full budget cycle from setting a limit to being alerted | Remaining budget updates each time and an over-budget alert appears on the last entry | Budget ₹5,000; remaining after each expense: ₹3,000 → ₹1,000 → −₹500; the last entry raised "Budget limit reached or exceeded." | Pass |
| ST_04 | End to end | Check that the health score reacts to a change in habits (FR18) | The score drops and a short reason for the change is shown | Score 100 (Excellent) → 10 (Needs improvement) after ₹15,000 of extra spending. Reasons: Your expenses equalled or exceeded your income. Spending exceeded your overall budget. | Pass |
| ST_05 | End to end | Full user journey from registration to export | Every step works in order and the exported figures match what the dashboard showed | register, login, income, 3 expenses, budget and dashboard all worked (spent ₹2,500, remaining ₹7,500), but export answered 404 | Fail (known gap) |
| ST_06 | End to end | Check that records survive a restart (NFR10) | All entries are still present and the totals are unchanged | 5 expenses (total ₹5,000) saved; the API was killed and restarted; all 5 were still there, the total was unchanged and the user was still logged in. | Pass |

## Non-functional check: NFR04 calculation accuracy

| Check | Expected | Actual Result | Test Result |
|---|---|---|---|
| 100-transaction test set (`backend/test/fixtures/transactions-100.csv`) | All figures match a manual calculation; any mismatch fails | 100 transactions (12 income, 88 expenses, 4 months) entered through the API. All 33 figures matched the hand calculation to the paisa: monthly totals, every category total, income, savings, remaining budgets and the forecast. | Pass |

## What needs to happen for the remaining cases

- **UT_13**: Category suggestion is not reachable: the API requires category_id, so the merchant-based suggestion never runs and the form offers none (#32).
- **UT_24**: Savings goals are not built yet (#50).
- **UT_25**: Time-to-goal estimate is not built yet (#51).
- **UT_26**: Time-to-goal estimate is not built yet (#51).
- **UT_29**: The what-if simulator takes a proposed budget and income, not a planned purchase, and gives no affordable/not-affordable verdict (#47, UC-08).
- **UT_30**: The what-if simulator takes a proposed budget and income, not a planned purchase, and gives no affordable/not-affordable verdict (#47, UC-08).
- **UT_32**: Report export is not built yet (#54 CSV, #55 PDF).
- **UT_33**: Report export is not built yet (#54 CSV, #55 PDF).
- **IT_08**: Recommendations treat 3 months of income as one month (reports ₹45,000 for a ₹15,000 salary), and the last category is padded to use up the whole limit (#45).
- **ST_05**: Every step up to the dashboard works; report export is not built yet (#54, #55), so the journey cannot finish.

