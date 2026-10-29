
import { useMemo, useState } from 'react';
import './spending-charts.css';

const COLORS = [
  '#3984f7',
  '#ff5b79',
  '#ffbd35',
  '#24c7a5',
  '#a879ed',
  '#ff8a42',
  '#23b8d9',
  '#8492a6',
];

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const compactMoney = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  return date.slice(0, 7);
}

function monthLabel(key, long = false) {
  const [year, month] = key.split('-').map(Number);

  if (!year || !month || month < 1 || month > 12) {
    return key;
  }

  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
}

function expenseAmount(expense) {
  const amount = Number(expense.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function expenseDate(expense) {
  return String(expense.spent_on || '').slice(0, 10);
}

function categoryName(expense, categories) {
  const category = categories.find(
    (item) => String(item.id) === String(expense.category_id),
  );

  return expense.category_name || category?.name || 'Uncategorized';
}

function getPeriodRange(period, selectedMonth, customStart, customEnd) {
  const today = new Date();
  const todayKey = localDateKey(today);

  if (period === 'custom') {
    return { start: customStart, end: customEnd };
  }

  if (period === 'month') {
    const [year, month] = String(selectedMonth || '')
      .split('-')
      .map(Number);

    if (!year || !month || month < 1 || month > 12) {
      return { start: '', end: '' };
    }

    const start =
      `${year}-${String(month).padStart(2, '0')}-01`;

    const monthEnd = localDateKey(new Date(year, month, 0));
    const end = monthEnd > todayKey ? todayKey : monthEnd;

    return { start, end };
  }

  if (period === '3months' || period === '6months') {
    const count = period === '3months' ? 3 : 6;

    const start = new Date(
      today.getFullYear(),
      today.getMonth() - count + 1,
      1,
    );

    return {
      start: localDateKey(start),
      end: todayKey,
    };
  }

  if (period === 'year') {
    return {
      start: `${today.getFullYear()}-01-01`,
      end: todayKey,
    };
  }

  return { start: '', end: '' };
}

function buildMonthlyData(expenses, start, end) {
  if (!start || !end || start > end) return [];

  const startDate = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    1,
  );
  const endDate = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    1,
  );

  const months = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate && months.length < 120) {
    const key = `${cursor.getFullYear()}-${String(
      cursor.getMonth() + 1,
    ).padStart(2, '0')}`;

    months.push({ key, label: monthLabel(key), total: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const totals = new Map(months.map((item) => [item.key, 0]));

  expenses.forEach((expense) => {
    const key = monthKey(expenseDate(expense));
    if (!totals.has(key)) return;

    totals.set(key, totals.get(key) + expenseAmount(expense));
  });

  return months.map((item) => ({
    ...item,
    total: totals.get(item.key) || 0,
  }));
}
function buildDailyData(expenses, start, end) {
  if (!start || !end || start > end) return [];

  const totals = new Map();
  const cursor = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );

  const endDate = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );

  while (cursor <= endDate) {
    const key = localDateKey(cursor);
    totals.set(key, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  expenses.forEach((expense) => {
    const date = expenseDate(expense);

    if (totals.has(date)) {
      totals.set(
        date,
        totals.get(date) + expenseAmount(expense),
      );
    }
  });

  return [...totals.entries()].map(([key, total]) => ({
    key,
    label: String(Number(key.slice(8, 10))),
    total,
  }));
}

function ChartCard({ eyebrow, title, subtitle, children, className = '' }) {
  return (
    <section className={`analytics-card ${className}`}>
      <div className="analytics-card-heading">
        <div>
          <p className="analytics-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="analytics-subtitle">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function MonthlyBarChart({ data }) {
  const width = 640;
  const height = 290;
  const left = 76;
  const right = 20;
  const top = 25;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.total));
  const slot = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(46, slot * 0.58);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  if (!data.length) {
    return <p className="analytics-empty">No monthly data for this period.</p>;
  }

  return (
    <div className="analytics-svg-scroll">
      <svg
        className="analytics-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly expense totals shown as a bar chart"
      >
        {ticks.map((fraction) => {
          const y = top + plotHeight * (1 - fraction);

          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="analytics-grid-line"
              />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                className="analytics-axis-label"
              >
                {compactMoney(max * fraction)}
              </text>
            </g>
          );
        })}

        {data.map((item, index) => {
          const barHeight = (item.total / max) * plotHeight;
          const x = left + index * slot + (slot - barWidth) / 2;
          const y = top + plotHeight - barHeight;

          return (
            <g key={item.key}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                rx="7"
                fill={COLORS[index % COLORS.length]}
                className="analytics-bar"
              >
                <title>{`${monthLabel(item.key, true)}: ${money(item.total)}`}</title>
              </rect>

              {data.length <= 12 && item.total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(top + 12, y - 7)}
                  textAnchor="middle"
                  className="analytics-value-label"
                >
                  {compactMoney(item.total)}
                </text>
              )}

              <text
                x={x + barWidth / 2}
                y={height - 17}
                textAnchor="middle"
                className="analytics-axis-label"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


function MonthlyLineChart({ data }) {
  const width = 640;
  const height = 290;
  const left = 76;
  const right = 20;
  const top = 25;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.total));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const points = data.map((item, index) => ({
    ...item,
    x: left + ((index + 0.5) / Math.max(data.length, 1)) * plotWidth,
    y: top + plotHeight - (item.total / max) * plotHeight,
  }));

  const linePath = points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
    )
    .join(' ');

  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${
        top + plotHeight
      } L ${points[0].x} ${top + plotHeight} Z`
    : '';

  if (!data.length) {
    return <p className="analytics-empty">No trend data for this period.</p>;
  }

  return (
    <div className="analytics-svg-scroll">
      <svg
        className="analytics-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly expense totals shown as a line chart"
      >
        <defs>
          <linearGradient id="monthlyLineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3984f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3984f7" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((fraction) => {
          const y = top + plotHeight * (1 - fraction);

          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="analytics-grid-line"
              />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                className="analytics-axis-label"
              >
                {compactMoney(max * fraction)}
              </text>
            </g>
          );
        })}

        {points.length > 1 && <path d={areaPath} fill="url(#monthlyLineFill)" />}

        {points.length > 1 && (
          <path d={linePath} className="analytics-line-path" />
        )}

        {points.map((point) => (
          <g key={point.key}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              className="analytics-line-point"
            >
              <title>{`${monthLabel(point.key, true)}: ${money(point.total)}`}</title>
            </circle>

            {data.length <= 12 && point.total > 0 && (
              <text
                x={point.x}
                y={Math.max(top + 12, point.y - 12)}
                textAnchor="middle"
                className="analytics-value-label"
              >
                {compactMoney(point.total)}
              </text>
            )}

            <text
              x={point.x}
              y={height - 17}
              textAnchor="middle"
              className="analytics-axis-label"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function DailyLineChart({ data }) {
  const width = 640;
  const height = 290;
  const left = 76;
  const right = 20;
  const top = 25;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.total));
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const points = data.map((item, index) => ({
    ...item,
    x:
      left +
      ((index + 0.5) / Math.max(data.length, 1)) * plotWidth,
    y: top + plotHeight - (item.total / max) * plotHeight,
  }));

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
    )
    .join(' ');

  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${
        top + plotHeight
      } L ${points[0].x} ${top + plotHeight} Z`
    : '';

  if (!data.length) {
    return (
      <p className="analytics-empty">
        No daily trend data for this period.
      </p>
    );
  }

  return (
    <div className="analytics-svg-scroll">
      <svg
        className="analytics-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Daily spending totals shown as a line chart"
      >
        <defs>
          <linearGradient
            id="dailyLineFill"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#3984f7"
              stopOpacity="0.25"
            />
            <stop
              offset="100%"
              stopColor="#3984f7"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>

        {ticks.map((fraction) => {
          const y = top + plotHeight * (1 - fraction);

          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="analytics-grid-line"
              />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                className="analytics-axis-label"
              >
                {compactMoney(max * fraction)}
              </text>
            </g>
          );
        })}

        {points.length > 1 && (
          <path
            d={areaPath}
            fill="url(#dailyLineFill)"
          />
        )}

        {points.length > 1 && (
          <path
            d={linePath}
            className="analytics-line-path"
          />
        )}

        {points.map((point, index) => (
          <g key={point.key}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              className="analytics-line-point"
            >
              <title>
                {`${point.key}: ${money(point.total)}`}
              </title>
            </circle>

            {point.total > 0 && (
              <text
                x={point.x}
                y={Math.max(top + 12, point.y - 10)}
                textAnchor="middle"
                className="analytics-value-label"
              >
                {compactMoney(point.total)}
              </text>
            )}

            {(index === 0 ||
              index === points.length - 1 ||
              Number(point.label) % 5 === 0) && (
              <text
                x={point.x}
                y={height - 17}
                textAnchor="middle"
                className="analytics-axis-label"
              >
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
function CategoryPieChart({ expenses, categories }) {
  const categoryData = useMemo(() => {
    const totals = new Map();

    expenses.forEach((expense) => {
      const amount = expenseAmount(expense);
      if (amount <= 0) return;

      const name = categoryName(expense, categories);
      totals.set(name, (totals.get(name) || 0) + amount);
    });

    return [...totals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categories]);

  const total = categoryData.reduce((sum, item) => sum + item.amount, 0);

  const gradient = useMemo(() => {
    if (!total) return '#edf1f7';

    let start = 0;

    return categoryData
      .map((item, index) => {
        const end = start + (item.amount / total) * 100;
        const segment = `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
        start = end;
        return segment;
      })
      .join(', ');
  }, [categoryData, total]);

  return (
    <>
      {!categoryData.length || total <= 0 ? (
        <p className="analytics-empty">Add expenses to see the category breakdown.</p>
      ) : (
        <div className="analytics-donut-layout">
          <div
            className="analytics-donut"
            style={{ background: `conic-gradient(${gradient})` }}
            role="img"
            aria-label={`Expense category breakdown, total ${money(total)}`}
          >
            <div className="analytics-donut-hole">
              <span>Total spent</span>
              <strong>{money(total)}</strong>
              <small>{categoryData.length} categories</small>
            </div>
          </div>

          <ul className="analytics-legend">
            {categoryData.map((item, index) => (
              <li key={item.name}>
                <span
                  className="analytics-legend-dot"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="analytics-legend-name">{item.name}</span>
                <span className="analytics-legend-value">
                  {money(item.amount)}
                  <small>{((item.amount / total) * 100).toFixed(1)}%</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function SpendingCharts({
  expenses = [],
  allExpenses = expenses,
  month,
  categories = [],
}) {
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const today = localDateKey(new Date());

  const range = getPeriodRange(
    period,
    month,
    customStart,
    customEnd,
  );

  const validRange =
    Boolean(range.start && range.end) &&
    range.start <= range.end &&
    range.end <= today;

  // Use the same filtered records for the totals and every chart.
  const filteredExpenses = useMemo(() => {
    if (!validRange) return [];

    return allExpenses.filter((expense) => {
      const date = expenseDate(expense);

      return (
        date >= range.start &&
        date <= range.end &&
        expenseAmount(expense) > 0
      );
    });
  }, [allExpenses, range.start, range.end, validRange]);

  const total = filteredExpenses.reduce(
    (sum, expense) => sum + expenseAmount(expense),
    0,
  );

  const monthlyData = useMemo(
    () => buildMonthlyData(filteredExpenses, range.start, range.end),
    [filteredExpenses, range.start, range.end],
  );
  
  const dailyData = useMemo(
    () => buildDailyData(filteredExpenses, range.start, range.end),
    [filteredExpenses, range.start, range.end],
  );

  const recordCount = filteredExpenses.length;
  const average = monthlyData.length ? total / monthlyData.length : 0;

  return (
    <div className="spending-analytics">
      <section className="analytics-filter-card">
        <div>
          <p className="analytics-eyebrow">YOUR MONEY AT A GLANCE</p>
          <h2>Spending analytics</h2>
          <p className="analytics-subtitle">
            Explore your expenses and understand where your money goes.
          </p>
        </div>

        <div className="analytics-period-controls">
          <label htmlFor="analytics-period">Financial period</label>
          <select
            id="analytics-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="month">Selected month</option>
            <option value="3months">Last 3 months</option>
            <option value="6months">Last 6 months</option>
            <option value="year">This year</option>
            <option value="custom">Custom date range</option>
          </select>
        </div>

        {period === 'custom' && (
          <div className="analytics-custom-range">
            <label>
              Start date
              <input
                type="date"
                value={customStart}
                max={customEnd || today}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>

            <label>
              End date
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={today}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
          </div>
        )}

        {period === 'custom' && !validRange && (
          <p className="analytics-error" role="alert">
            Choose a valid start date and end date. Future dates are not allowed.
          </p>
        )}

        {validRange && (
          <p className="analytics-range-note">
            {range.start} to {range.end}
          </p>
        )}
      </section>

      {validRange && (
        <>
          <div className="analytics-summary-grid">
            <article className="analytics-summary-card">
              <span className="analytics-summary-icon blue">₹</span>
              <div>
                <p>Total expenses</p>
                <strong>{money(total)}</strong>
                <small>Across the selected period</small>
              </div>
            </article>

            <article className="analytics-summary-card">
              <span className="analytics-summary-icon purple">▤</span>
              <div>
                <p>Expense records</p>
                <strong>{recordCount}</strong>
                <small>Recorded transactions</small>
              </div>
            </article>

            <article className="analytics-summary-card">
              <span className="analytics-summary-icon teal">↗</span>
              <div>
                <p>Monthly average</p>
                <strong>{money(average)}</strong>
                <small>Average across months shown</small>
              </div>
            </article>
          </div>

          <div className="analytics-chart-grid">
            <ChartCard
              eyebrow="COMPARE YOUR SPENDING"
              title="Monthly expense comparison"
              subtitle="Compare total expenses across the selected period"
            >
              <MonthlyBarChart data={monthlyData} />
            </ChartCard>

            <ChartCard
              eyebrow="WHERE IT GOES"
              title="Expense breakdown by category"
              subtitle="Share of total spending by category"
            >
              <CategoryPieChart
                expenses={filteredExpenses}
                categories={categories}
              />
            </ChartCard>

            <ChartCard
  eyebrow="SPENDING OVER TIME"
  title={
    period === 'month'
      ? 'Daily spending trend'
      : 'Monthly spending trend'
  }
  subtitle={
    period === 'month'
      ? 'See how your daily expenses change'
      : 'See how your monthly expenses change'
  }
>
  {period === 'month' ? (
    <DailyLineChart data={dailyData} />
  ) : (
    <MonthlyLineChart data={monthlyData} />
  )}
</ChartCard>

            <ChartCard
              eyebrow="TOP CATEGORIES"
              title="Highest spending categories"
              subtitle="Categories ranked by total amount"
            >
              <TopCategories
                expenses={filteredExpenses}
                categories={categories}
              />
            </ChartCard>
          </div>
        </>
      )}

      {!validRange && period !== 'custom' && (
        <p className="analytics-empty">
          Select a valid period to view your spending analytics.
        </p>
      )}
    </div>
  );
}

function TopCategories({ expenses, categories }) {
  const items = useMemo(() => {
    const totals = new Map();

    expenses.forEach((expense) => {
      const amount = expenseAmount(expense);
      if (amount <= 0) return;

      const name = categoryName(expense, categories);
      totals.set(name, (totals.get(name) || 0) + amount);
    });

    return [...totals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categories]);

  const max = Math.max(1, ...items.map((item) => item.amount));

  if (!items.length) {
    return <p className="analytics-empty">No category expenses in this period.</p>;
  }

  return (
    <div className="analytics-top-categories">
      {items.map((item, index) => (
        <div className="analytics-top-row" key={item.name}>
          <span className="analytics-top-name">{item.name}</span>
          <div className="analytics-top-track">
            <div
              className="analytics-top-fill"
              style={{
                width: `${(item.amount / max) * 100}%`,
                backgroundColor: COLORS[index % COLORS.length],
              }}
            />
          </div>
          <strong>{money(item.amount)}</strong>
        </div>
      ))}
    </div>
  );
}
