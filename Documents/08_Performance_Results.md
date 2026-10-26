# Performance Results

Smart Expense & Budget Management System. Results for NFR01 (dashboard speed)
and NFR05 (scalability).

| Requirement | Target | Result |
|---|---|---|
| NFR01 Performance | Dashboard with one year of data loads in under 3 seconds | **Pass.** Median 47 ms, slowest 69 ms over 30 loads |
| NFR05 Scalability | Response times hold with 1,000 users and 100,000 transactions; fail if they roughly double | **Pass.** Median 20 → 21 ms (×1.05), 95th percentile 35 → 41 ms (×1.17) |

## Setup

- **Run:** 26 October 2026, on one laptop: Intel Core i7-9750H, 12 threads, 16 GB RAM.
- **Software:** Node.js 24 and PostgreSQL 17.11.
- **Same-machine caveat:** the API, the database and the load generator all ran on the same machine. This is harder than a real deployment, since they compete for the same CPU, but it leaves out network time between the browser and the server.
- **API process:** one Node.js process with a pool of 10 database connections, exactly as the app ships. Only the per-source rate limit was raised (`API_RATE_LIMIT`), because a single machine sending thousands of requests would otherwise be blocked by SR09 after 300.
- **Separate database:** `smart_expense_load`. The seeding script refuses to touch any database whose name doesn't end in `_load`.

| Dataset | Users | Expenses | Income records |
|---|---|---|---|
| Small (baseline) | 11 | 2,825 | 132 |
| Full (NFR05) | 1,001 | 101,825 | 12,012 |

Both datasets include one heavy user with 5 expenses a day for a full year (1,825 expenses) for the dashboard timing. Every other user has 100 expenses spread over the last 12 months, a monthly salary and a budget for this month.

## NFR01: dashboard load time

The runner makes the same requests, in the same order, as the web app's dashboard:

1. The session check.
2. Six requests in parallel: remaining budget, categories, expenses, recurring payments, budget alerts, health score.
3. Four in turn: generate due payments, reload recurring payments, payment reminders, notifications.

The time measured is from the first request to the last response. Each run is 30 loads after one warm-up.

| Dataset | Median | 95th percentile | Slowest | Failed |
|---|---|---|---|---|
| Small | 52 ms | 72 ms | 75 ms | 0 |
| Full | 47 ms | 56 ms | 69 ms | 0 |

The slowest load is about 40× faster than the 3-second limit. Network round trips on a normal connection would add roughly 3 × the round-trip time, since the dashboard waits on three rounds of requests. At 100 ms per round trip that's about 0.3 s, which still leaves a wide margin.

This measures the API, not the browser. The expense list currently draws every expense in one table (1,825 rows for the heavy user). It isn't part of these numbers, and the "Expense list with search, filter and pagination" card would keep it fast as data grows.

## NFR05: scalability

Each connection repeatedly picks a random user and a random dashboard request for 20 seconds. The requests are remaining budget, expense list, monthly analytics, health score, alerts, forecast, categories and notifications. The workload was identical on both datasets.

| Dataset | Connections | Requests | Per second | Median | 95th | 99th | Errors |
|---|---|---|---|---|---|---|---|
| Small | 20 | 18,160 | 908 | 20 ms | 35 ms | 45 ms | 0 |
| Full | 20 | 16,742 | 837 | 21 ms | 41 ms | 62 ms | 0 |
| Full | 100 | 13,765 | 688 | 137 ms | 215 ms | 291 ms | 0 |

Growing the data 36× in expenses and 91× in users changed the median by 5% and the 95th percentile by 17%, well short of the "roughly doubles" failure line. The `(user_id, …)` indexes from the schema keep each user's queries small however many other users there are.

With 100 simultaneous connections, latency rises because one Node.js process and 10 database connections queue the work. The 99th percentile was still 291 ms with no errors. Throughput levels off at about 700–900 requests per second on this machine. For more traffic, run several API processes behind a load balancer, which the stateless design allows, as the Architecture Justification notes.

## How to repeat

```bash
createdb smart_expense_load
cd backend
DATABASE_URL=postgres://localhost/smart_expense_load npm run migrate
DATABASE_URL=postgres://localhost/smart_expense_load npm run load:seed -- --users 1000 --per-user 100

# in a second terminal: the API against the load database, rate limit raised
DATABASE_URL=postgres://localhost/smart_expense_load NODE_ENV=test PORT=4100 API_RATE_LIMIT=100000000 npm start

npm run load:run -- dashboard --runs 30
npm run load:run -- load --connections 20 --seconds 20
```

For the baseline, seed with `--users 10` first and run the same commands.
