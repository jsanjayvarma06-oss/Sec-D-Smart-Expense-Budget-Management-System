import { useEffect, useState } from 'react';

export default function SecurityMonitor({ apiRequest }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiRequest('/api/admin/security')
      .then((res) => {
        if (active) {
          setData(res.security);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Could not load security overview.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiRequest]);

  if (error) return <p className="error-message" role="alert">{error}</p>;
  if (loading || !data) return <p className="muted" role="status">Loading security monitor…</p>;

  const { totals, timeline, top_targeted_accounts: topAccounts } = data;

  return (
    <div className="security-monitor">
      <p className="muted">
        Security monitor for the last 7 days. Spot failed logins, brute-force attempts, and account lockouts (SR07, SR09).
        In accordance with SR10, no passwords, tokens, or financial amounts are stored or displayed.
      </p>

      {/* Summary Cards */}
      <section className="summary-grid" aria-label="Security summary">
        <article className="summary-card">
          <p>Total Events (7 Days)</p>
          <h2>{totals.total_events.toLocaleString('en-IN')}</h2>
          <small>Security-relevant actions</small>
        </article>
        <article className="summary-card">
          <p>Failed Logins</p>
          <h2 style={{ color: totals.login_failed > 0 ? '#b91c1c' : 'inherit' }}>
            {totals.login_failed.toLocaleString('en-IN')}
          </h2>
          <small>Wrong passwords</small>
        </article>
        <article className="summary-card">
          <p>Account Lockouts</p>
          <h2 style={{ color: totals.account_locked > 0 ? '#b45309' : 'inherit' }}>
            {totals.account_locked.toLocaleString('en-IN')}
          </h2>
          <small>Triggered by 5+ failures</small>
        </article>
        <article className="summary-card">
          <p>Rate Limit Blocks</p>
          <h2>{totals.rate_limit_blocked.toLocaleString('en-IN')}</h2>
          <small>Exceeded threshold</small>
        </article>
      </section>

      {/* 7-Day Daily Breakdown Table */}
      <section aria-labelledby="security-daily-title" style={{ marginTop: '24px' }}>
        <h3 id="security-daily-title">Daily Security Events</h3>
        <div className="expense-table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th scope="col">Date (UTC)</th>
                <th scope="col">Failed Logins</th>
                <th scope="col">Account Lockouts</th>
                <th scope="col">2FA Failures</th>
                <th scope="col">Rate Limit Blocks</th>
                <th scope="col">Password Resets</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) => (
                <tr key={row.day}>
                  <td><strong>{row.day}</strong></td>
                  <td>{row.login_failed}</td>
                  <td>{row.account_locked}</td>
                  <td>{row.two_factor_failed}</td>
                  <td>{row.rate_limit_blocked}</td>
                  <td>{row.password_reset_requested}</td>
                  <td><strong>{row.total}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Targeted Accounts Table */}
      <section aria-labelledby="security-accounts-title" style={{ marginTop: '28px' }}>
        <h3 id="security-accounts-title">Most Targeted Accounts (Last 7 Days)</h3>
        {topAccounts.length === 0 ? (
          <p className="muted">No accounts targeted by failed logins or lockouts in the last 7 days.</p>
        ) : (
          <div className="expense-table-wrapper">
            <table className="expense-table">
              <thead>
                <tr>
                  <th scope="col">Account Email</th>
                  <th scope="col">Failed Attempts</th>
                  <th scope="col">Account Status</th>
                  <th scope="col">Last Event</th>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map((account) => {
                  let statusBadge = <span className="status-badge active">Active</span>;
                  if (account.is_disabled) {
                    statusBadge = <span className="status-badge disabled">Disabled</span>;
                  } else if (account.is_locked) {
                    statusBadge = <span className="status-badge locked">Locked</span>;
                  }

                  return (
                    <tr key={account.email}>
                      <td><strong>{account.email}</strong></td>
                      <td>
                        <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                          {account.failed_count}
                        </span>
                      </td>
                      <td>{statusBadge}</td>
                      <td>
                        <small className="muted">
                          {account.last_event_at
                            ? new Date(account.last_event_at).toLocaleString()
                            : '—'}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
