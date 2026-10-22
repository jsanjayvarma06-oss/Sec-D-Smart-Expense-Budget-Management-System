
import { useCallback, useEffect, useState } from 'react';

const currentMonth = new Date().toISOString().slice(0, 7);

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(
      result.message || result.error || `Request failed (${response.status})`,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      if (mode === 'register') {
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        });

        setMessage('Account created. Please log in with your new credentials.');
        setMode('login');
        setPassword('');
      } else {
        await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        await onLogin();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">PERSONAL FINANCE</p>
        <h1>Smart Expense &amp; Budget</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Log in to view your finances.'
            : 'Create an account to start managing your budget.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setError('');
              setMessage('');
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setError('');
              setMessage('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              maxLength={72}
              required
            />
          </label>

          {error && <p className="error-message" role="alert">{error}</p>}
          {message && <p className="success-message" role="status">{message}</p>}

          <button type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }) {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadBudgets() {
      setLoading(true);
      setError('');

      try {
        const result = await apiRequest(
          `/api/budgets/remaining?month=${encodeURIComponent(month)}`,
        );

        if (active) {
          setBudgets(result.remainingBudgets || []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load budgets.');
          setBudgets([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBudgets();

    return () => {
      active = false;
    };
  }, [month, refreshVersion]);

  const overallBudget = budgets.find(
    (budget) => budget.category_id === null,
  );

  const categoryBudgets = budgets.filter(
    (budget) => budget.category_id !== null,
  );

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      await onLogout();
    } catch (err) {
      setError(err.message || 'Could not log out.');
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">PERSONAL FINANCE</p>
          <h1>Smart Expense &amp; Budget</h1>
          <p className="muted">Welcome, {user.name}.</p>
        </div>

        <div className="header-actions">
          <label className="month-picker">
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="connection-panel">
        <span>API and database: <strong className="status status-ok">Connected</strong></span>
        <button
          type="button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh budgets'}
        </button>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}

      <section className="summary-grid" aria-label="Budget summary">
        <article className="summary-card">
          <p>Total monthly budget</p>
          <h2>{overallBudget ? formatCurrency(overallBudget.budget_amount) : 'Not set'}</h2>
        </article>
        <article className="summary-card">
          <p>Total spent</p>
          <h2>{overallBudget ? formatCurrency(overallBudget.spent_amount) : '—'}</h2>
        </article>
        <article className="summary-card">
          <p>Remaining budget</p>
          <h2 className={overallBudget?.exceeded ? 'amount-negative' : ''}>
            {overallBudget ? formatCurrency(overallBudget.remaining_amount) : '—'}
          </h2>
        </article>
      </section>

      <section className="budget-section">
        <h2>Category budgets</h2>
        <p className="muted">Spending and remaining amounts for {month}.</p>

        {loading && <p role="status">Loading budgets…</p>}

        {!loading && !error && budgets.length === 0 && (
          <div className="empty-state">
            <h3>No budgets found</h3>
            <p>Create a monthly budget to see your remaining balance.</p>
          </div>
        )}

        {!loading && categoryBudgets.length > 0 && (
          <div className="budget-list">
            {categoryBudgets.map((budget) => {
              const percentage = budget.budget_amount > 0
                ? Math.min(100, (budget.spent_amount / budget.budget_amount) * 100)
                : 0;

              return (
                <article className="budget-card" key={budget.budget_id}>
                  <div className="budget-card-heading">
                    <div>
                      <h3>{budget.category_name || 'Category'}</h3>
                      <p className="muted">
                        {formatCurrency(budget.spent_amount)} spent of{' '}
                        {formatCurrency(budget.budget_amount)}
                      </p>
                    </div>
                    <div className="budget-remaining">
                      <strong className={budget.exceeded ? 'amount-negative' : ''}>
                        {formatCurrency(budget.remaining_amount)}
                      </strong>
                      <span>remaining</span>
                    </div>
                  </div>

                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${budget.category_name} budget used`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percentage)}
                  >
                    <div
                      className={`progress-fill ${budget.exceeded ? 'progress-exceeded' : ''}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {budget.exceeded && (
                    <p className="warning-message">This category budget has been exceeded.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!loading && overallBudget?.exceeded && (
          <p className="warning-message">Your overall monthly budget has been exceeded.</p>
        )}
      </section>

      <footer className="dashboard-footer">
        <p className="muted">
          Signed in as {user.email}. Expense forms will be connected next.
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          disabled={loading}
        >
          Recalculate remaining budget
        </button>
      </footer>
    </main>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    const result = await apiRequest('/api/auth/me');
    setUser(result.user);
  }, []);

  useEffect(() => {
    let active = true;

    fetch('/api/health')
      .then((response) => {
        if (active) setApiStatus(response.ok ? 'ok' : 'error');
      })
      .catch(() => {
        if (active) setApiStatus('error');
      });

    apiRequest('/api/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogoutComplete() {
    setUser(null);
  }

  if (checkingSession) {
    return <main className="auth-page"><p role="status">Checking your session…</p></main>;
  }

  if (!user) {
    return (
      <>
        <AuthScreen onLogin={loadCurrentUser} />
        <p className="auth-api-status">
          API: <strong className={`status status-${apiStatus}`}>{apiStatus}</strong>
        </p>
      </>
    );
  }

  return <Dashboard user={user} onLogout={handleLogoutComplete} />;
}
