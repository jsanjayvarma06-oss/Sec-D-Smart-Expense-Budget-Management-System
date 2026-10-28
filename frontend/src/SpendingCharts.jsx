
import { useMemo } from 'react';

const COLORS = [
  '#4776e6',
  '#25b8a8',
  '#f2a93b',
  '#e66b61',
  '#9a78d0',
  '#3d9bd9',
  '#d75a9e',
  '#7b8794',
];

const WIDTH = 640;
const HEIGHT = 260;
const LEFT = 76;
const RIGHT = 24;
const TOP = 24;
const BOTTOM = 40;

function currency(value, compact = false) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    ...(compact
      ? { notation: 'compact', compactDisplay: 'short' }
      : {}),
  }).format(Number(value) || 0);
}

function getAmount(expense) {
  const amount = Number(expense.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getCategoryName(expense, categories) {
  const category = categories.find(
    (item) => String(item.id) === String(expense.category_id),
  );

  return expense.category_name || category?.name || 'Uncategorized';
}

function getMonthKey(date) {
  return String(date ?? '').slice(0, 7);
}

function formatMonth(key, options = { month: 'short' }) {
  const [year, month] = key.split('-').map(Number);

  if (!year || !month) return key;

  return new Date(year, month - 1, 1).toLocaleDateString(
    'en-IN',
    options,
  );
}

// Draw a smooth curve through the supplied points.
function smoothPath(points) {
  if (!points.length) return '';

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const middleX = (previous.x + current.x) / 2;

    path += ` C ${middleX} ${previous.y}, ${middleX} ${current.y}, ${current.x} ${current.y}`;
  }

  return path;
}

function ChartGrid({ max, plotHeight }) {
  return [0, 0.5, 1].map((fraction) => {
    const y = TOP + plotHeight * fraction;
    const value = max * (1 - fraction);

    return (
      <g key={fraction}>
        <line
          x1={LEFT}
          y1={y}
          x2={WIDTH - RIGHT}
          y2={y}
          className="chart-grid-line"
        />

        <text
          x={LEFT - 10}
          y={y + 4}
          textAnchor="end"
          className="chart-axis-label"
        >
          {currency(value, true)}
        </text>
      </g>
    );
  });
}

// STORY #40: Daily spending trend
function SpendingTrend({ expenses, month }) {
  const days = useMemo(() => {
    const [year, monthNumber] = String(month || '')
      .split('-')
      .map(Number);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      return [];
    }

    const dayCount = new Date(year, monthNumber, 0).getDate();
    const totals = Array(dayCount).fill(0);

    expenses.forEach((expense) => {
      const date = String(expense.spent_on ?? '').slice(0, 10);
      const [expenseYear, expenseMonth, day] = date
        .split('-')
        .map(Number);

      if (
        expenseYear === year &&
        expenseMonth === monthNumber &&
        day >= 1 &&
        day <= dayCount
      ) {
        totals[day - 1] += getAmount(expense);
      }
    });

    return totals.map((amount, index) => ({
      day: index + 1,
      amount,
    }));
  }, [expenses, month]);

  const total = days.reduce((sum, day) => sum + day.amount, 0);
  const activeDays = days.filter((day) => day.amount > 0).length;
  const average = activeDays ? total / activeDays : 0;
  const highestDay = days.reduce(
    (best, day) => (day.amount > best.amount ? day : best),
    { day: 0, amount: 0 },
  );

  const max = Math.max(1, ...days.map((day) => day.amount));
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;

  const points = days.map((item, index) => ({
    ...item,
    x: LEFT + (index / Math.max(days.length - 1, 1)) * plotWidth,
    y:
      TOP +
      plotHeight -
      (item.amount / max) * plotHeight,
  }));

  const line = smoothPath(points);

  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${
        TOP + plotHeight
      } L ${points[0].x} ${TOP + plotHeight} Z`
    : '';

  const labelDays = days.length
    ? [...new Set([1, 5, 10, 15, 20, 25, days.length])]
        .filter((day) => day <= days.length)
    : [];

  return (
    <section
      className="chart-card"
      aria-labelledby="spending-trend-title"
    >
      <div className="chart-heading-row">
        <div>
          <p className="chart-kicker">DAILY ACTIVITY</p>
          <h2 id="spending-trend-title">
            Daily spending trend
          </h2>
          <p className="muted">
            Spending throughout{' '}
            {formatMonth(month, {
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <span className="chart-icon-badge" aria-hidden="true">
          ↗
        </span>
      </div>

      <div className="chart-stat-strip">
        <div>
          <span className="chart-stat-label">Monthly total</span>
          <strong>{currency(total)}</strong>
        </div>

        <div>
          <span className="chart-stat-label">Daily average*</span>
          <strong>{currency(average)}</strong>
        </div>

        <div>
          <span className="chart-stat-label">Active days</span>
          <strong>{activeDays}</strong>
        </div>
      </div>

      {days.length === 0 || activeDays === 0 ? (
        <p className="chart-empty">
          No expenses recorded for this month yet.
        </p>
      ) : (
        <div className="chart-scroll">
          <svg
            className="trend-chart enhanced-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Daily spending trend for ${month}`}
          >
            <defs>
              <linearGradient
                id="dailyAreaGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#4776e6"
                  stopOpacity=".28"
                />
                <stop
                  offset="100%"
                  stopColor="#4776e6"
                  stopOpacity=".015"
                />
              </linearGradient>
            </defs>

            <ChartGrid max={max} plotHeight={plotHeight} />

            <path d={area} fill="url(#dailyAreaGradient)" />

            <path
              d={line}
              className="trend-line enhanced-trend-line"
            />

            {points
              .filter((point) => point.amount > 0)
              .map((point) => (
                <circle
                  key={point.day}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className="trend-point enhanced-trend-point"
                >
                  <title>
                    {`${month}-${String(point.day).padStart(2, '0')}: ${currency(point.amount)}`}
                  </title>
                </circle>
              ))}

            {labelDays.map((day) => (
              <text
                key={day}
                x={points[day - 1].x}
                y={HEIGHT - 9}
                textAnchor="middle"
                className="chart-axis-label"
              >
                {day}
              </text>
            ))}
          </svg>
        </div>
      )}

      <p className="chart-footnote">
        *Average across days with recorded spending.
        {highestDay.amount > 0
          ? ` Highest: ${currency(highestDay.amount)} on day ${highestDay.day}.`
          : ''}
      </p>
    </section>
  );
}

// STORY #41: Spending by category
function CategorySplit({ expenses, categories }) {
  const totals = useMemo(() => {
    const grouped = new Map();

    expenses.forEach((expense) => {
      const amount = getAmount(expense);

      if (amount <= 0) return;

      const name = getCategoryName(expense, categories);

      grouped.set(name, (grouped.get(name) || 0) + amount);
    });

    return [...grouped.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categories]);

  const total = totals.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const gradient = useMemo(() => {
    if (total <= 0) return 'transparent';

    let accumulated = 0;

    return totals
      .map((item, index) => {
        const start = accumulated;
        accumulated += (item.amount / total) * 100;

        return `${COLORS[index % COLORS.length]} ${start}% ${accumulated}%`;
      })
      .join(', ');
  }, [totals, total]);

  return (
    <section
      className="chart-card"
      aria-labelledby="category-split-title"
    >
      <div className="chart-heading-row">
        <div>
          <p className="chart-kicker">WHERE IT GOES</p>
          <h2 id="category-split-title">
            Spending by category
          </h2>
          <p className="muted">
            How your expenses are distributed
          </p>
        </div>

        <span
          className="chart-icon-badge chart-icon-teal"
          aria-hidden="true"
        >
          ◔
        </span>
      </div>

      {totals.length === 0 || total <= 0 ? (
        <p className="chart-empty">
          Add expenses to see your category breakdown.
        </p>
      ) : (
        <div className="donut-layout">
          <div className="donut-wrap">
            <div
              className="category-donut"
              role="img"
              aria-label={`Category breakdown of ${currency(total)}`}
              style={{
                background: `conic-gradient(${gradient})`,
              }}
            >
              <div className="donut-hole">
                <span>Total spent</span>
                <strong>{currency(total)}</strong>
                <small>
                  {totals.length}{' '}
                  {totals.length === 1 ? 'category' : 'categories'}
                </small>
              </div>
            </div>
          </div>

          <ul className="category-legend enhanced-legend">
            {totals.map((item, index) => (
              <li key={item.name}>
                <span
                  className="category-swatch"
                  style={{
                    backgroundColor:
                      COLORS[index % COLORS.length],
                  }}
                />

                <span className="category-name">
                  {item.name}
                </span>

                <span className="category-amount">
                  {currency(item.amount)}
                  <small>
                    {((item.amount / total) * 100).toFixed(1)}%
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="chart-footnote">
        Based on recorded expenses for the selected month.
      </p>
    </section>
  );
}

// Additional chart: historical monthly spending by category
function MonthlySpending({ expenses, categories, month }) {
  const data = useMemo(() => {
    const [year, monthNumber] = String(month || '')
      .split('-')
      .map(Number);

    if (!year || !monthNumber) {
      return { months: [], series: [] };
    }

    const months = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(
        year,
        monthNumber - 1 - offset,
        1,
      );

      months.push(
        `${date.getFullYear()}-${String(
          date.getMonth() + 1,
        ).padStart(2, '0')}`,
      );
    }

    const grouped = new Map();

    expenses.forEach((expense) => {
      const key = getMonthKey(expense.spent_on);
      const amount = getAmount(expense);

      if (!months.includes(key) || amount <= 0) return;

      const name = getCategoryName(expense, categories);

      if (!grouped.has(name)) {
        grouped.set(name, new Map());
      }

      const values = grouped.get(name);
      values.set(key, (values.get(key) || 0) + amount);
    });

    const ranked = [...grouped.entries()]
      .map(([name, values]) => ({
        name,
        values: months.map((key) => values.get(key) || 0),
        total: [...values.values()].reduce(
          (sum, value) => sum + value,
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total);

    const series = ranked.slice(0, 4);

    if (ranked.length > 4) {
      series.push({
        name: 'Other categories',
        values: months.map((_, index) =>
          ranked.slice(4).reduce(
            (sum, item) => sum + item.values[index],
            0,
          ),
        ),
      });
    }

    return { months, series };
  }, [expenses, categories, month]);

  const { months, series } = data;

  const max = Math.max(
    1,
    ...series.flatMap((item) => item.values),
  );

  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;

  const xAt = (index) =>
    LEFT +
    (index / Math.max(months.length - 1, 1)) * plotWidth;

  const selectedTotal = expenses
    .filter(
      (expense) =>
        getMonthKey(expense.spent_on) === month,
    )
    .reduce((sum, expense) => sum + getAmount(expense), 0);

  return (
    <section
      className="chart-card monthly-card"
      aria-labelledby="monthly-spending-title"
    >
      <div className="chart-heading-row">
        <div>
          <p className="chart-kicker">OVER TIME</p>
          <h2 id="monthly-spending-title">
            Monthly spending
          </h2>
          <p className="muted">
            Category trends across the last six months
          </p>
        </div>

        <span className="monthly-total-pill">
          {currency(selectedTotal)}
          <small>Selected month</small>
        </span>
      </div>

      {!series.some((item) =>
        item.values.some((value) => value > 0),
      ) ? (
        <p className="chart-empty monthly-empty">
          Add expenses across months to see your spending history.
        </p>
      ) : (
        <>
          <div className="chart-scroll">
            <svg
              className="trend-chart monthly-trend-chart"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label="Monthly spending by category over the last six months"
            >
              <ChartGrid max={max} plotHeight={plotHeight} />

              {series.map((item, index) => {
                const points = item.values.map(
                  (value, pointIndex) => ({
                    x: xAt(pointIndex),
                    y:
                      TOP +
                      plotHeight -
                      (value / max) * plotHeight,
                    value,
                    month: months[pointIndex],
                  }),
                );

                const line = smoothPath(points);

                const area = `${line} L ${
                  points[points.length - 1].x
                } ${TOP + plotHeight} L ${
                  points[0].x
                } ${TOP + plotHeight} Z`;

                return (
                  <g key={item.name}>
                    <path
                      d={area}
                      fill={COLORS[index % COLORS.length]}
                      opacity=".07"
                    />

                    <path
                      d={line}
                      fill="none"
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {points.map((point) => (
                      <circle
                        key={point.month}
                        cx={point.x}
                        cy={point.y}
                        r={point.value > 0 ? 3.5 : 2}
                        fill={COLORS[index % COLORS.length]}
                        stroke="#fff"
                        strokeWidth="1"
                      >
                        <title>
                          {`${item.name} · ${formatMonth(
                            point.month,
                            {
                              month: 'long',
                              year: 'numeric',
                            },
                          )}: ${currency(point.value)}`}
                        </title>
                      </circle>
                    ))}
                  </g>
                );
              })}

              {months.map((key, index) => (
                <text
                  key={key}
                  x={xAt(index)}
                  y={HEIGHT - 9}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {formatMonth(key)}
                </text>
              ))}
            </svg>
          </div>

          <div className="monthly-legend">
            {series.map((item, index) => (
              <span key={item.name}>
                <i
                  style={{
                    backgroundColor:
                      COLORS[index % COLORS.length],
                  }}
                />
                {item.name}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function SpendingCharts({
  expenses = [],
  allExpenses = expenses,
  month,
  categories = [],
}) {
  return (
    <div className="spending-charts enhanced-spending-charts">
      <SpendingTrend
        expenses={expenses}
        month={month}
      />

      <CategorySplit
        expenses={expenses}
        categories={categories}
      />

      <MonthlySpending
        expenses={allExpenses}
        categories={categories}
        month={month}
      />
    </div>
  );
}
