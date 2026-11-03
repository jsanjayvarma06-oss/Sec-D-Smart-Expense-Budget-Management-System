# Unit Test Report

**Project:** Smart Expense & Budget Management System (Sec-D)  
**Execution Date:** November 3, 2026  
**Test Suite Coverage:** Backend (UT_01 to UT_50) & Frontend (Voice Parser & Receipt Parser)  
**Tester / Assignee:** Sanjay Varma  
**Reference Document:** [04_Test_Plan.pdf](../04_Test_Plan.pdf)  
**Status:** **100% Passed (87 / 87 Unit Tests Passed, 0 Failed, 0 Skipped)**

---

## 1. Executive Summary

This report documents the execution results of the comprehensive automated Unit Test suites across backend and frontend modules as defined in the system test plan. Testing verifies core domain business logic, data validation, mathematical calculations, security isolation, authentication hardening, receipt parsing, and natural language query interpretation.

### Summary Metrics
| Scope | Total Tests | Passed | Failed | Skipped | Pass Rate |
|---|---|---|---|---|---|
| **Backend Unit Tests (Plan)** | 50 | 50 | 0 | 0 | **100%** |
| **Frontend Unit Tests (Voice & OCR)** | 37 | 37 | 0 | 0 | **100%** |
| **Combined Unit Testing Total** | **87** | **87** | **0** | **0** | **100%** |

---

## 2. Test Environment & Execution Details

- **Backend Runtime:** Node.js v24.12.0 (ES Modules) with native test runner (`node:test`)
- **Database:** PostgreSQL 17 on `localhost:5432/smart_expense_test` with Row-Level Security (RLS)
- **Frontend Engine:** Vitest / Node test runner with simulated DOM & regex tokenizers
- **API Test Framework:** Supertest v7.3.1
- **Execution Command (Backend):** `node --env-file-if-exists=backend/.env.test --test backend/test/plan/unit.test.js`
- **Execution Command (Frontend):** `npm test --workspace frontend`

---

## 3. Detailed Test Execution Matrix

### 3.1 Backend Unit Tests (Plan Test Suite: UT_01 to UT_50)

| Test ID | Module / Feature Area | Description & Assertions | Expected Outcome | Actual Outcome | Status |
|---|---|---|---|---|:---:|
| **UT_01** | User Auth (UC-01) | Valid registration & session login | Account created (201), HttpOnly cookie set, user profile retrievable | Account created (201); dashboard loaded for registered user | **PASS** |
| **UT_02** | User Auth (UC-01) | Login with valid credentials | 200 OK returned with valid session cookie | Login succeeded (200) with session cookie | **PASS** |
| **UT_03** | User Auth (UC-01) | Login with incorrect password | 401 Unauthorized, generic error message, no cookie | 401 "Invalid email or password", no session cookie | **PASS** |
| **UT_04** | User Auth (UC-01) | Registration with duplicate email | 409 Conflict rejection, user warned | 409 Conflict "An account with this email already exists" | **PASS** |
| **UT_05** | User Auth (UC-01) | Validation of empty required fields | 400 Bad Request with field-specific errors | 400 Bad Request with validation messages for email and password | **PASS** |
| **UT_06** | User Auth (SR02) | Password storage encryption | Password hashed with bcrypt cost factor 12 | Stored value is bcrypt hash (`$2b$12$...`), non-plaintext | **PASS** |
| **UT_07** | Expenses (UC-02) | Add valid expense record | Expense recorded (201) and listed with formatted amount | Expense of ₹450 recorded and shown first in expense list | **PASS** |
| **UT_08** | Expenses (UC-02) | Negative expense amount validation | 400 Bad Request rejecting non-positive amounts | Refused (400) with "Amount must be greater than zero" | **PASS** |
| **UT_09** | Expenses (UC-02) | Future date validation | 400 Bad Request rejecting dates ahead of current server time | Refused (400) with "Expense date cannot be in the future" | **PASS** |
| **UT_10** | Expenses (UC-02) | Edit existing expense amount | Updated value saved (200) and analytics recomputed | Amount updated ₹450 → ₹600; monthly total updated | **PASS** |
| **UT_11** | Expenses (UC-02) | Delete expense record | 204 No Content, item removed, monthly analytics decremented | Deleted (204); list is empty and month total is ₹0 | **PASS** |
| **UT_12** | Income (UC-03) | Add income record | 201 Created; total income and net savings increase | Income of ₹15,000 saved; monthly balance increased | **PASS** |
| **UT_13** | Smart Features (FR05) | Automatic merchant category suggestion | Known merchant (Metro Station) auto-categorized to Transport | Suggested Transport (201); explicit category override preserved | **PASS** |
| **UT_14** | Budgets (UC-04) | Monthly overall budget setting | 201 Created; reflected in remaining budget calculation | Monthly budget of ₹10,000 saved and returned in dashboard data | **PASS** |
| **UT_15** | Budgets (UC-04) | Non-positive budget validation | 400 Bad Request rejecting zero and negative limits | 0 and -50 both refused (400) with validation error | **PASS** |
| **UT_16** | Budgets (UC-04) | Category-specific budget limits | Category-level budget tracked independently from overall | Category budget of ₹3,000 tracked alongside ₹10,000 overall | **PASS** |
| **UT_17** | Budgets (FR08) | Remaining budget computation | Accurate arithmetic: `remaining = budget - spent` | Budget ₹10,000, spent ₹2,500: remaining shows ₹7,500 | **PASS** |
| **UT_18** | Analytics (FR10) | Category breakdown pie chart totals | Aggregation matches sum of individual category expenses | Food ₹1,200, Travel ₹800, Bills ₹2,000 match expense totals | **PASS** |
| **UT_19** | Analytics (UC-05) | Monthly spending trend history | Monthly chronological totals computed accurately | 3-month history correctly computed (₹3,000, ₹4,500, ₹6,000) | **PASS** |
| **UT_20** | Anomaly Detection (FR11) | Unusual high expense detection | Statistical deviation flagged for review (>3x category avg) | ₹9,000 flagged for review against recent average ₹400 | **PASS** |
| **UT_21** | Anomaly Detection (FR11) | Normal expense baseline verification | Routine transaction within normal limits saved unflagged | ₹350 saved normally with no anomaly flag | **PASS** |
| **UT_22** | Forecasting (FR12) | Linear 3-month expenditure projection | Forecast weighted against preceding 3 months | Forecast ₹8,500 based on previous 3-month spending | **PASS** |
| **UT_23** | Forecasting (FR12) | Insufficient history handling | Informative warning returned when <3 months history | Gracefully withheld; prompt for 3 months history displayed | **PASS** |
| **UT_24** | Savings Goals (FR14) | Savings goal creation and progress | Target, current saved amount, and percentage tracked | Created Emergency Fund (₹10,000 target, ₹2,500 saved, 25% done) | **PASS** |
| **UT_25** | Savings Goals (FR15) | Time-to-goal completion estimation | Months remaining projected from average monthly savings | ₹15,000 remaining at ₹6,000/mo estimated at 3 months | **PASS** |
| **UT_26** | Savings Goals (FR15) | Zero-savings rate estimation fallback | Handles zero or negative monthly savings gracefully | Informative message returned without division by zero | **PASS** |
| **UT_27** | Recurring Expenses (FR16) | Recurring subscription setup | Next payment date and billing cadence saved | Monthly Rent of ₹6,000 saved with correct due date | **PASS** |
| **UT_28** | Recurring Expenses (FR16) | Idempotent recurring payment processing | Duplicate cycle runs do not create duplicate expenses | Exactly one record created per billing cycle | **PASS** |
| **UT_29** | What-If Simulator (FR19) | Affordable purchase simulation | Verdict `affordable: true` with projected remaining balance | Post-purchase balance computed; verified affordable | **PASS** |
| **UT_30** | What-If Simulator (FR19) | Unaffordable purchase simulation | Verdict `affordable: false` with calculated shortfall | Shortfall ₹32,500 computed; correctly marked unaffordable | **PASS** |
| **UT_31** | What-If Simulator (FR19) | Simulation isolation verification | Simulation strictly non-persistent (zero DB side-effects) | Real remaining budget and expense rows unaltered | **PASS** |
| **UT_32** | Reports (FR20) | CSV export generation | Valid CSV headers, correct row values, proper mime type | CSV report downloaded with complete expense fields | **PASS** |
| **UT_33** | Reports (FR20) | CSV export for empty month | Returns valid CSV header row without data corruption | Empty-month CSV returned with column headings and 0 data rows | **PASS** |
| **UT_34** | Savings Goals (#159) | Update existing savings goal | Update target amount and saved amount | Progress updated to 50% with ₹5,000 remaining | **PASS** |
| **UT_35** | Savings Goals (#159) | Delete savings goal | Goal removed from user list | Goal deleted successfully and removed from active list | **PASS** |
| **UT_36** | Savings Goals (#159) | Cross-user goal isolation (RLS) | User cannot modify or delete other user's goal | Access denied; other user modifications rejected | **PASS** |
| **UT_37** | Savings Goals (#159) | 100% Achieved goal estimate | Completed goal shows 0 months remaining | Fully funded goal confirms 0 months remaining | **PASS** |
| **UT_38** | Savings Goals (#159) | Target amount adjustment recalculation | Estimate dynamically updates on target amount change | Increasing target recalculated estimate from 3 to 4 months | **PASS** |
| **UT_39** | Savings Goals (#159) | Savings rate change recalculation | Estimate dynamically updates when saving rate shifts | Increasing savings rate recalculated estimate from 3 to 2 months | **PASS** |
| **UT_40** | Auth Hardening (SR09) | Password recovery and token reset | Password reset email sent, token resets password | Password reset link received, token reset password successfully | **PASS** |
| **UT_41** | Security (SR09) | Account lockout upon 5 consecutive fails | 6th attempt rejected with 429 ACCOUNT_LOCKED | 5 failed logins locked account; 6th returned 429 ACCOUNT_LOCKED | **PASS** |
| **UT_42** | Security (SR09) | Anti-enumeration timing mitigation | Identical 401 responses and timing for registered/unregistered | Response error and time indistinguishable | **PASS** |
| **UT_43** | Two-Factor Auth (SR03) | 2FA TOTP setup & QR code generation | Returns base32 secret, otpauth URI, and QR code data URL | Valid TOTP secret, URI, and QR code data URL generated | **PASS** |
| **UT_44** | Two-Factor Auth (SR03) | 2FA verification & backup codes | 10 single-use backup codes issued; login verifies code | 2FA enrolled, 10 backup codes generated; backup code allowed login | **PASS** |
| **UT_45** | Admin Access (SR01) | Admin role authorization enforcement | Non-admin receives 403 Forbidden; admin receives 200 OK | Regular user rejected (403); Admin user allowed (200) | **PASS** |
| **UT_46** | Security Monitor (SR09) | Security event telemetry recording | Logged events aggregated in 7-day timeline | Security events recorded and queried via admin monitor | **PASS** |
| **UT_47** | Admin Audit (SR10) | Append-only audit log recording | Audit entries cannot be modified or deleted | Action logged to append-only audit trail with admin metadata | **PASS** |
| **UT_48** | Admin Users (SR04) | Admin unlock & session termination | Admin can clear lockout and revoke user sessions | Locked account unlocked; active sessions terminated | **PASS** |
| **UT_49** | Natural Language (FR21) | Natural language money query engine | Query parsed and correct financial answer returned | "How much did I spend on Food?" accurately answered (₹350.00) | **PASS** |
| **UT_50** | Receipt OCR (FR22) | Receipt text parser extraction | Extracts amount, merchant, date, and category | Extracted amount ₹280.00, date 2026-10-28, merchant, matched Food | **PASS** |

---

### 3.2 Frontend Unit Tests (Parser & Voice Entry Engines)

| Test Suite | Total Tests | Passed | Highlights / Validated Cases | Status |
|---|:---:|:---:|---|:---:|
| **receiptParser: amount extraction** | 4 | 4 | Grand Total parsing, currency symbols, comma separation, net payable, max price fallback | **PASS** |
| **receiptParser: date extraction** | 5 | 5 | DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY, ISO YYYY-MM-DD, future date rejection | **PASS** |
| **receiptParser: merchant extraction** | 2 | 2 | Header detection, tax/GST line filtering, greeting message suppression | **PASS** |
| **receiptParser: full receipt integration** | 4 | 4 | Supermarket, cafe/restaurant, pharmacy slips, blank/noise text handling | **PASS** |
| **voice entry: whole sentences** | 12 | 12 | Natural voice command sentence structures (slang, numbers in words, multi-word amounts) | **PASS** |
| **voice entry: amounts** | 8 | 8 | Word-to-number conversion ("ninety nine", "one hundred", "two lakh", "seven fifty", etc.) | **PASS** |
| **voice entry: user boundaries** | 2 | 2 | Does not hallucinate non-existent categories; handles empty input safely | **PASS** |

---

## 4. Defect Logs & Resolutions

During the execution cycle, unit test findings were addressed to ensure zero regressions and 100% adherence to specifications:

1. **Defect #UT-D01: Foreign Key Cascade during User Cleanup**
   - *Symptom:* `adminAnnouncements.test.js` failed during `beforeEach` user deletion due to missing cascade constraint on `announcements.admin_id`.
   - *Resolution:* Added `ON DELETE CASCADE` to foreign key constraint in `018_announcements.sql`.

2. **Defect #UT-D02: Asynchronous Password Reset Outbox Race Condition**
   - *Symptom:* Fast test execution occasionally read `mail_outbox` before background worker persisted the token.
   - *Resolution:* Added safe bounded async settling delay and base64url regex matching for password recovery tokens.

3. **Defect #UT-D03: Multi-calling Signature Compatibility**
   - *Symptom:* `recordSecurityEvent` and `recordAdminAction` expected object arguments in app code but positional arguments in test harnesses.
   - *Resolution:* Updated method signatures to transparently handle both positional and named-parameter argument styles.

---

## 5. Conclusion & Verification

All **87 automated unit test cases** (50 backend + 37 frontend) have executed and **passed with 100% success rate**. No known defects remain in the unit testing scope.
