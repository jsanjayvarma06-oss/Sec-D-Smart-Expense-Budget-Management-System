// Load and timing runner for NFR01 and NFR05, using only Node's fetch.
//
//   API_URL=http://localhost:4100 node scripts/load/run.js dashboard [--runs 30]
//   API_URL=http://localhost:4100 node scripts/load/run.js load [--connections 20] [--seconds 30]
//
// dashboard  Times a full dashboard load for the heavy user (a year of daily
//            spending), making the same requests in the same order as the web
//            app: session check, six requests in parallel, then four in turn.
// load       Many simulated users at once: each connection picks a random user
//            from load-sessions.json and a random dashboard request, as fast as
//            the API answers, for the given time.
//
// Prints a JSON summary on the last line so results can be recorded.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode = 'dashboard', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((pairs, arg, i, all) => (
  arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []));
const base = process.env.API_URL ?? 'http://localhost:4100';
const sessions = JSON.parse(fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/load-sessions.json'), 'utf8',
));

const localDay = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const month = localDay().slice(0, 7);

async function call(cookie, method, url, body) {
  const started = performance.now();
  const res = await fetch(base + url, {
    method,
    headers: { Cookie: cookie, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  await res.arrayBuffer();
  return { ms: performance.now() - started, status: res.status };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const round = (n) => Math.round(n);

async function dashboardOnce(cookie) {
  const started = performance.now();
  const statuses = [];
  const track = async (p) => { const r = await p; statuses.push(r.status); return r; };
  await track(call(cookie, 'GET', '/api/auth/me'));
  await Promise.all([
    track(call(cookie, 'GET', `/api/budgets/remaining?month=${month}`)),
    track(call(cookie, 'GET', '/api/categories')),
    track(call(cookie, 'GET', '/api/expenses')),
    track(call(cookie, 'GET', '/api/recurring-expenses')),
    track(call(cookie, 'GET', `/api/budgets/alerts?month=${month}`)),
    track(call(cookie, 'GET', `/api/financial-health?month=${month}`)),
  ]);
  await track(call(cookie, 'POST', '/api/recurring-expenses/generate-due', { today: localDay() }));
  await track(call(cookie, 'GET', '/api/recurring-expenses'));
  await track(call(cookie, 'POST', '/api/notifications/payment-reminders', { today: localDay() }));
  await track(call(cookie, 'GET', '/api/notifications'));
  return { ms: performance.now() - started, ok: statuses.every((s) => s < 400) };
}

async function dashboard() {
  const heavy = sessions.find((s) => s.email === 'heavy@example.test');
  const runs = Number(args.runs ?? 30);
  const times = [];
  let failures = 0;
  await dashboardOnce(heavy.cookie); // warm-up, not counted
  for (let i = 0; i < runs; i += 1) {
    const r = await dashboardOnce(heavy.cookie);
    times.push(r.ms);
    if (!r.ok) failures += 1;
  }
  const summary = {
    mode, runs, failures,
    p50_ms: round(percentile(times, 50)), p95_ms: round(percentile(times, 95)), max_ms: round(Math.max(...times)),
  };
  console.log(`Dashboard load for a user with a year of daily spending, ${runs} runs: median ${summary.p50_ms} ms, 95th percentile ${summary.p95_ms} ms, slowest ${summary.max_ms} ms, ${failures} failed`);
  console.log(JSON.stringify(summary));
}

const MIX = [
  ['GET', () => `/api/budgets/remaining?month=${month}`],
  ['GET', () => '/api/expenses'],
  ['GET', () => `/api/analytics/monthly?month=${month}`],
  ['GET', () => `/api/financial-health?month=${month}`],
  ['GET', () => `/api/budgets/alerts?month=${month}`],
  ['GET', () => '/api/forecast/monthly'],
  ['GET', () => '/api/categories'],
  ['GET', () => '/api/notifications'],
];

async function load() {
  const users = sessions.filter((s) => s.email !== 'heavy@example.test');
  const connections = Number(args.connections ?? 20);
  const seconds = Number(args.seconds ?? 30);
  const latencies = [];
  const statuses = {};
  const endAt = performance.now() + seconds * 1000;

  async function worker() {
    while (performance.now() < endAt) {
      const user = users[Math.floor(Math.random() * users.length)];
      const [method, url] = MIX[Math.floor(Math.random() * MIX.length)];
      try {
        const r = await call(user.cookie, method, url());
        latencies.push(r.ms);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      } catch {
        statuses.network_error = (statuses.network_error ?? 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: connections }, worker));

  const errors = Object.entries(statuses).filter(([s]) => s === 'network_error' || Number(s) >= 400)
    .reduce((n, [, c]) => n + c, 0);
  const summary = {
    mode, users: users.length, connections, seconds, requests: latencies.length,
    requests_per_second: round(latencies.length / seconds), errors,
    p50_ms: round(percentile(latencies, 50)), p95_ms: round(percentile(latencies, 95)),
    p99_ms: round(percentile(latencies, 99)), statuses,
  };
  console.log(`${connections} connections for ${seconds} s across ${users.length} users: ${summary.requests} requests (${summary.requests_per_second}/s), median ${summary.p50_ms} ms, 95th ${summary.p95_ms} ms, 99th ${summary.p99_ms} ms, ${errors} errors`);
  console.log(JSON.stringify(summary));
}

await (mode === 'load' ? load() : dashboard());
