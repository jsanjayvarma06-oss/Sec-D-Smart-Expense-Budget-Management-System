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

## Documents in this folder

| File | What it is |
|---|---|
| `01_SRS_Document.pdf` | 20 functional, 10 non-functional and 10 security requirements, each with priority, acceptance criteria and rationale, plus a user story to requirement to use case traceability table |
| `02_UseCase_Diagram.pdf` | UML use case diagram with all actors, use cases and include/extend relationships |
| `Flow.png` | Image version of the use case diagram |
| `03_UseCase_Flows.pdf` | Flow specifications for all ten use cases, UC-01 to UC-10, each with goal, actors, main flow and alternate flows |
| `04_Test_Plan.pdf` | 50 test cases across unit, integration and system testing |
| `05_Secure Architecture Design.pdf` | Assets, trust boundaries, access policy and threat map for SR01–SR10 |
| `Architecture_Justification.pdf` | Why a layered architecture was chosen |
| `UML_Component_Diagram.png` | Components and interfaces of the layered design |
| `06_Backup_and_Recovery_Strategy.md` | Backup frequency and retention, recovery procedures and forced-shutdown results (NFR10) |
| `07_Test_Results.md` | Actual results for all 50 test-plan cases and the NFR04 calculation check, generated from an automated run |
| `08_Performance_Results.md` | Dashboard timing (NFR01) and load test with 1,000 users and 100,000 transactions (NFR05) |
| `09_Decisions_and_Deviations.md` | Agreed thresholds (for sign-off), SRS updates, and every difference between the build and the SRS, SAD and test plan |
| `10_API_Reference.md` | Every API endpoint with its inputs, rules and limits |
| `Sprint1_Demo_Script.md`, `Sprint1_Demo.mp4` | Sprint 1 demo |
| `Sprint2_Demo_Script.md` | Script for the Sprint 2 demo video |

---|---|
| `01_Requirements_Table.docx` | 20 functional, 10 non-functional and 10 security requirements, each with priority, acceptance criteria, rationale and review comments. Ends with a user story to requirement to use case traceability table. |
| `02_UseCase_Diagram.pdf` | UML use case diagram with all actors, use cases and stereotype relationships |
| `usecase_diagram.png` | Image version of the same diagram, for embedding in reports or slides |
| `smart_expense_usecase.drawio` | Editable draw.io source for the diagram |
| `03_UseCase_Flows.pdf` | Flow specifications for all ten use cases, UC-01 to UC-10, each with goal, actors, main flow and alternate flows |
| `04_Test_Plan.docx` / `.pdf` | 50 test cases across unit, integration and system testing |
| `06_Backup_and_Recovery_Strategy.md` | Backup frequency and retention, recovery procedures and forced-shutdown test results (NFR10) |

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

Every case is now automated (`backend/test/plan/`). `npm run test:plan -w backend` runs them
and fills in the Actual Result and Test Result columns in `07_Test_Results.md` from the run.
Cases for features that are not built yet are listed as not run, never as passing.

---

## Working with the Diagram

1. Open [app.diagrams.net](https://app.diagrams.net)
2. **File → Open From → Device**, then select the diagram's `.drawio` source (kept outside this
   repository; `Flow.png` and `02_UseCase_Diagram.pdf` are its exports)
3. Edit as needed, then **File → Export as → PDF**

Note on notation: `«include»` arrows point from the base use case to the included one,
while `«extend»` arrows point from the extending use case to the base. Getting these
backwards is the most common mistake in use case diagrams.

---

## Known Gaps

- **UC-08 Run What-If Simulation** has no include or extend relationship, though it
  arguably should reuse Forecast Monthly Expenditure. The build does reuse the forecast.
- The placeholder thresholds now have proposed values in `09_Decisions_and_Deviations.md`,
  waiting for team sign-off.
- FR07 is decided: category budgets that add up to more than the monthly budget are refused.
- Everything else where the build differs from these documents is listed, with owners, in
  `09_Decisions_and_Deviations.md`.
