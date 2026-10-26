// Builds Documents/07_Test_Results.md from the last run of the test-plan cases.
//
//   npm run test:plan -w backend
//
// runs backend/test/plan/*.test.js, which save each case's outcome and what
// actually happened to backend/test-results/, then calls this script. The
// "Actual Result" column therefore comes from the run itself.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(fs.readFileSync(path.join(here, '../test/plan/testPlan.json'), 'utf8'));
const resultsDir = path.join(here, '../test-results');
const outFile = path.join(here, '../../Documents/07_Test_Results.md');

const results = {};
for (const file of ['unit', 'integration', 'system', 'nfr04']) {
  const p = path.join(resultsDir, `${file}.json`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Run the test-plan tests first.`);
  for (const r of JSON.parse(fs.readFileSync(p, 'utf8'))) results[r.id] = r;
}

const LABEL = { pass: 'Pass', fail: 'Fail', 'known gap': 'Fail (known gap)', 'not implemented': 'Not run (not built)' };
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const runDate = new Date().toISOString().slice(0, 10);

const counts = { pass: 0, fail: 0, 'known gap': 0, 'not implemented': 0 };
for (const c of plan) counts[results[c.id]?.outcome ?? 'fail'] += 1;

const sections = [
  ['Unit tests (UT)', 'UT_'],
  ['Integration tests (IT)', 'IT_'],
  ['System tests (ST)', 'ST_'],
];

const lines = [];
lines.push('# Test Results');
lines.push('');
lines.push('Smart Expense & Budget Management System. Results for the 50 cases in');
lines.push('`04_Test_Plan.pdf`, plus the NFR04 calculation check.');
lines.push('');
lines.push(`**Run:** ${runDate}, Node.js ${process.version}, PostgreSQL 17, through the real API`);
lines.push('(`npm run test:plan -w backend`). Each case is an automated test named after its ID in');
lines.push('`backend/test/plan/`. The Actual Result column is what that test observed in this run.');
lines.push('');
lines.push('As the test plan says, cases for features that are not built yet are not run');
lines.push('and are not counted as passing.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Result | Cases |');
lines.push('|---|---|');
lines.push(`| Pass | ${counts.pass} |`);
lines.push(`| Fail (known gap, tracked on the board) | ${counts['known gap']} |`);
lines.push(`| Fail | ${counts.fail} |`);
lines.push(`| Not run (feature not built) | ${counts['not implemented']} |`);
lines.push(`| **Total** | **${plan.length}** |`);
lines.push('');

for (const [title, prefix] of sections) {
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| ID | Module | Description | Expected Results | Actual Result | Test Result |');
  lines.push('|---|---|---|---|---|---|');
  for (const c of plan.filter((p) => p.id.startsWith(prefix))) {
    const r = results[c.id] ?? { outcome: 'fail', actual: 'Not run' };
    const actual = r.outcome === 'not implemented' ? r.note : r.actual;
    lines.push(`| ${c.id} | ${cell(c.module)} | ${cell(c.description)} | ${cell(c.expected)} | ${cell(actual)} | ${LABEL[r.outcome]} |`);
  }
  lines.push('');
}

const nfr = results.NFR04;
lines.push('## Non-functional check: NFR04 calculation accuracy');
lines.push('');
lines.push('| Check | Expected | Actual Result | Test Result |');
lines.push('|---|---|---|---|');
lines.push(`| 100-transaction test set (\`backend/test/fixtures/transactions-100.csv\`) | All figures match a manual calculation; any mismatch fails | ${cell(nfr?.actual ?? 'Not run')} | ${LABEL[nfr?.outcome ?? 'fail']} |`);
lines.push('');

const gaps = plan.map((c) => ({ c, r: results[c.id] })).filter(({ r }) => r && (r.outcome === 'known gap' || r.outcome === 'not implemented'));
lines.push('## What needs to happen for the remaining cases');
lines.push('');
for (const { c, r } of gaps) lines.push(`- **${c.id}**: ${r.note}`);
lines.push('');

fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outFile)}: ${counts.pass} pass, ${counts['known gap']} known gaps, ${counts.fail} fail, ${counts['not implemented']} not built`);
