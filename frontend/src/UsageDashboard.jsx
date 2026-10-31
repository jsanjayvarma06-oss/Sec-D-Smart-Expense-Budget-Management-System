import { useEffect, useState } from 'react';

// Admin usage view (#125, #127). This screen receives aggregate counts only;
// it never requests or renders an individual user's financial information.
export default function UsageDashboard({ apiRequest }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/api/admin/usage')
      .then((result) => {
        if (active) setUsage(result.usage);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load usage metrics.');
      });
    return () => {
      active = false;
    };
  }, [apiRequest]);

  if (error) return <p className="error-message" role="alert">{error}</p>;
  if (!usage) return <p className="muted" role="status">Loading usage metrics…</p>;

  function count(value, suppressed) {
    if (suppressed) return <span className="muted">Hidden (fewer than 5 users)</span>;
    return value.toLocaleString('en-IN');
  }

  return (
    <div className="usage-dashboard">
      <p className="muted">
        Aggregate activity for the last {usage.period_days} days. Daily groups with fewer than
        five users are hidden. No names, emails, amounts, notes or individual records are shown.
      </p>

      <section className="summary-grid" aria-label="Weekly usage">
        <article className="summary-card">
          <p>Weekly active users</p>
          <h2>{usage.weekly_active_users.toLocaleString('en-IN')}</h2>
          <small>Active in the last 7 days</small>
        </article>
      </section>

      <section aria-labelledby="usage-daily-title">
        <h3 id="usage-daily-title">Daily activity</h3>
        <div className="expense-table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>New sign-ups</th>
                <th>Expenses added</th>
              </tr>
            </thead>
            <tbody>
              {usage.daily.map((day) => (
                <tr key={day.date}>
                  <td>{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}</td>
                  <td>{count(day.new_signups, day.signups_suppressed)}</td>
                  <td>{count(day.expenses_added, day.expenses_suppressed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="usage-categories-title">
        <h3 id="usage-categories-title">Most-used categories</h3>
        <p className="muted">Only shared category names used by at least five users are listed. Smaller groups are combined as Other when safe to show.</p>
        {usage.top_categories.length === 0 ? (
          <p className="muted">No category groups meet the privacy threshold yet.</p>
        ) : (
          <div className="expense-table-wrapper">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Expenses added</th>
                  <th>Users</th>
                </tr>
              </thead>
              <tbody>
                {usage.top_categories.map((item) => (
                  <tr key={item.category}>
                    <td>{item.category}</td>
                    <td>{item.expense_count.toLocaleString('en-IN')}</td>
                    <td>{item.users.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
