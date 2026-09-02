# Smart Expense & Budget Management System

Requirements engineering, use case modelling and test planning documents for the
Smart Expense & Budget Management System.

---

## About the Project

Most expense-tracking apps record where money went and stop there, leaving the user to
interpret the data themselves. This system goes further: it forecasts expected monthly
spending, flags unusual transactions, recommends budgets based on the user's own history,
and lets the user test a purchase decision before committing to it through a what-if
simulator.

**Target users:** students and young adults with irregular income, working professionals
who want a forward-looking view of their finances, and first-time budgeters who find
spreadsheets too manual.

Because the system holds personal financial data, security requirements are kept as a
separate category rather than folded into the non-functional list.

---

## Repository Contents

| File | What it is |
|---|---|
| `01_Requirements_Table.docx` | 20 functional, 10 non-functional and 10 security requirements, each with priority, acceptance criteria, rationale and review comments. Ends with a user story to requirement to use case traceability table. |
| `02_UseCase_Diagram.pdf` | UML use case diagram with all actors, use cases and stereotype relationships |
| `usecase_diagram.png` | Image version of the same diagram, for embedding in reports or slides |
| `smart_expense_usecase.drawio` | Editable draw.io source for the diagram |
| `03_UseCase_Flow.docx` / `.pdf` | One-page flow specification for UC-03 Manage Expense Records |
| `04_Test_Plan.docx` / `.pdf` | 50 test cases across unit, integration and system testing |

---

## Actors

| Actor | Role |
|---|---|
| **User** | Primary actor. Performs all direct interactions with the system. |
| **Analytics / Prediction Engine** | Supporting actor. Handles category suggestion, anomaly detection, expenditure forecasting and budget recommendation. |
| **Notification Service** | Supporting actor. Delivers budget alerts and recurring payment reminders. |

The two supporting actors exist because the more interesting features are not user-triggered.
They run outside the main request flow and respond to system events rather than button presses.

---

## Use Cases

| ID | Use Case |
|---|---|
| UC-01 | Register & Login |
| UC-02 | Manage Income Records |
| UC-03 | Manage Expense Records |
| UC-04 | Manage Budgets |
| UC-05 | View Dashboard & Analytics |
| UC-06 | Manage Savings Goals |
| UC-07 | Manage Recurring Expenses |
| UC-08 | Run What-If Simulation |
| UC-09 | View Financial Health Score |
| UC-10 | Export Financial Report |

**Included use cases** (always run as part of the base use case):
Authenticate User, Validate & Categorize Entry, Forecast Monthly Expenditure,
Estimate Time to Goal.

**Extending use cases** (run only under certain conditions):
Suggest Expense Category, Detect Unusual Spending, Send Budget Alert,
Recommend Budget, Send Payment Reminder.

---

## Requirements at a Glance

| Category | Count | IDs |
|---|---|---|
| Functional | 20 | FR01 – FR20 |
| Non-functional | 10 | NFR01 – NFR10 |
| Security | 10 | SR01 – SR10 |

Each requirement carries a priority, a pass/fail acceptance criterion and a short rationale.
Where the original specification was not testable (for example "the dashboard should load
within a few seconds"), a concrete figure has been put into the acceptance criteria. Those
figures are marked in the Comments column and should be reviewed before they are treated
as fixed.

---

## Test Plan Summary

| Type | Count | Covers |
|---|---|---|
| Unit (UT) | 33 | Individual functions and form validations |
| Integration (IT) | 11 | Modules working together, e.g. an expense entry updating the remaining budget |
| System (ST) | 6 | Complete user journeys and cross-cutting behaviour |
| **Total** | **50** | |

Test cases are grouped into six modules and cover both valid and invalid inputs.

The **Actual Result** and **Test Result** columns are intentionally left blank. They are to be
filled in by hand while running each case. Test cases covering features that have not been
implemented yet should be removed rather than marked as passing.

---

## Working with the Diagram

1. Open [app.diagrams.net](https://app.diagrams.net)
2. **File → Open From → Device**, then select `smart_expense_usecase.drawio`
3. Edit as needed, then **File → Export as → PDF**

Note on notation: `«include»` arrows point from the base use case to the included one,
while `«extend»` arrows point from the extending use case to the base. Getting these
backwards is the most common mistake in use case diagrams.

---

## Known Gaps

- **UC-08 Run What-If Simulation** has no include or extend relationship, though it
  arguably should reuse Forecast Monthly Expenditure, since a simulation runs the same
  prediction with a hypothetical expense added.
- Several numeric thresholds in the acceptance criteria (dashboard load time, forecast
  error margin, alert threshold percentage, session timeout) are placeholders and need
  to be agreed on.
- FR07 does not say whether category budgets summing above the monthly budget should be
  blocked or merely flagged.
