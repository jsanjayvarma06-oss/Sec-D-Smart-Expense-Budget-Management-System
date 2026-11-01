import { useEffect, useState } from 'react';
import AdminCategories from './AdminCategories.jsx';
import AuditLog from './AuditLog.jsx';
import SystemHealth from './SystemHealth.jsx';
import UsageDashboard from './UsageDashboard.jsx';
import UserManagement from './UserManagement.jsx';

// Admin panel shell (story #109). Admins manage accounts and the system, never
// personal finances: no section here shows anyone's expenses, income, budgets
// or notes. Each section is filled in by its own card; BUILT lists the ones
// that are done.
const SECTIONS = [
  { id: 'users', label: 'Users', text: 'Find an account, unlock it, log it out everywhere, or disable it.', card: 113 },
  { id: 'security', label: 'Security', text: 'Failed logins, lockouts and blocked requests over the last 7 days.', card: 117 },
  { id: 'usage', label: 'Usage', text: 'Sign-ups, active users and the most-used categories, as counts only.', card: 125 },
  { id: 'system', label: 'System', text: 'API and database status, version, migrations and the last backup.', card: 120 },
  { id: 'categories', label: 'Categories', text: 'Add, rename or retire the built-in categories.', card: 128 },
  { id: 'announcements', label: 'Announcements', text: 'Send a short notice to every user.', card: 130 },
  { id: 'audit', label: 'Audit log', text: 'Every admin action: who did it, what, to which account and when.', card: 122 },
];

const BUILT = {
  users: UserManagement,
  categories: AdminCategories,
  usage: UsageDashboard,
  system: SystemHealth,
  audit: AuditLog,
};

export default function AdminPanel({ user, apiRequest, onBack }) {
  const [section, setSection] = useState('users');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    // The server decides who is an admin; this call fails with 403 otherwise.
    apiRequest('/api/admin/overview')
      .then((result) => {
        if (active) setOverview(result.overview);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not open the admin panel.');
      });

    return () => {
      active = false;
    };
  }, [apiRequest]);

  const current = SECTIONS.find((item) => item.id === section);
  const Section = BUILT[section];

  return (
    <main className="dashboard admin-panel">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Admin panel</h1>
          <p className="muted">Signed in as {user.name}. Account and system tools only.</p>
        </div>

        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back to my dashboard
          </button>
        </div>
      </header>

      {error ? (
        <p className="error-message" role="alert">{error}</p>
      ) : (
        <>
          <section className="summary-grid" aria-label="Accounts">
            <article className="summary-card">
              <p>Accounts</p>
              <h2>{overview ? overview.user_count : '…'}</h2>
            </article>
            <article className="summary-card">
              <p>Admins</p>
              <h2>{overview ? overview.admin_count : '…'}</h2>
            </article>
            <article className="summary-card">
              <p>Locked right now</p>
              <h2>{overview ? overview.locked_count : '…'}</h2>
            </article>
          </section>

          <div className="admin-layout">
            <nav className="admin-nav" aria-label="Admin sections">
              {SECTIONS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === section ? 'active' : ''}
                  aria-current={item.id === section ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <section className="admin-section" aria-labelledby="admin-section-title">
              <h2 id="admin-section-title">{current.label}</h2>
              <p>{current.text}</p>
              {Section ? (
                <Section apiRequest={apiRequest} currentUser={user} />
              ) : (
                <p className="muted">Being built in card #{current.card}.</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
