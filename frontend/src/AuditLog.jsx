import { useEffect, useState } from 'react';

// Audit log section of the admin panel (story #122): every admin action, newest
// first, filtered by admin, action and date. Entries can't be changed, so this
// screen only reads them.
const ACTION_LABELS = {
  view_overview: 'Opened the admin panel',
  view_system_health: 'Checked system health',
  view_audit_log: 'Viewed the audit log',
  view_default_categories: 'Viewed the built-in categories',
  create_default_category: 'Added a built-in category',
  rename_default_category: 'Renamed a built-in category',
  delete_default_category: 'Removed a built-in category',
};

const NO_FILTERS = { adminId: '', action: '', from: '', to: '' };

function actionLabel(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const words = action.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Details as "key: value" pairs. Times and admin IDs (from a filtered view of
// this log) are shown the way the rest of the screen shows them.
function formatDetails(details, admins) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => {
    let shown = value;
    if (key === 'admin_id') shown = admins.find((admin) => admin.id === value)?.name ?? value;
    else if (key === 'action') shown = actionLabel(value);
    else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) shown = formatDateTime(value);
    return `${key.replace(/_id$/, '').replace(/_/g, ' ')}: ${shown}`;
  }).join(', ');
}

// Start of a local day as a timestamp. The server compares timestamps, so the
// dates mean the admin's own days, not the server's.
function startOfDay(date, addDays = 0) {
  const day = new Date(`${date}T00:00:00`);
  day.setDate(day.getDate() + addDays);
  return day.toISOString();
}

function queryString({ adminId, action, from, to }) {
  const params = new URLSearchParams();
  if (adminId) params.set('admin_id', adminId);
  if (action) params.set('action', action);
  if (from) params.set('from', startOfDay(from));
  // "To" includes the whole day, so ask for everything before the next one.
  if (to) params.set('to', startOfDay(to, 1));
  return params.toString();
}

export default function AuditLog({ apiRequest }) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const query = queryString(filters);
  // The answer is kept with the query it was for, so the screen knows it is
  // still loading after a filter changes.
  const [result, setResult] = useState({ log: null, error: '', query: null });
  const { log, error } = result;
  const loading = result.query !== query;

  useEffect(() => {
    let active = true;

    apiRequest(`/api/admin/audit-log${query ? `?${query}` : ''}`)
      .then((response) => {
        if (active) setResult({ log: response, error: '', query });
      })
      .catch((err) => {
        if (active) {
          setResult((previous) => ({
            ...previous,
            error: err.message || 'Could not load the audit log.',
            query,
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [apiRequest, query]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="audit-log">
      <form className="audit-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          Admin
          <select value={filters.adminId} onChange={(event) => updateFilter('adminId', event.target.value)}>
            <option value="">All admins</option>
            {log?.admins.map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.name}</option>
            ))}
          </select>
        </label>

        <label>
          Action
          <select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}>
            <option value="">All actions</option>
            {log?.actions.map((action) => (
              <option key={action} value={action}>{actionLabel(action)}</option>
            ))}
          </select>
        </label>

        <label>
          From
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={() => setFilters(NO_FILTERS)}
          disabled={!filtered}
        >
          Clear filters
        </button>
      </form>

      {error && <p className="error-message" role="alert">{error}</p>}

      {!log && !error && <p className="muted">Loading…</p>}

      {log && log.entries.length === 0 && (
        <p>{filtered ? 'No admin actions match these filters.' : 'No admin actions recorded yet.'}</p>
      )}

      {log && log.entries.length > 0 && (
        <div className="expense-table-wrapper" aria-busy={loading}>
          <table className="expense-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Account</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.created_at)}</td>
                  <td>{entry.admin_name ?? <span className="muted">Deleted account</span>}</td>
                  <td>{actionLabel(entry.action)}</td>
                  <td>
                    {!entry.target_user_id && '—'}
                    {entry.target_user_id && (entry.target_name
                      ? <>{entry.target_name}<br /><span className="muted">{entry.target_email}</span></>
                      : <span className="muted">Deleted account</span>)}
                  </td>
                  <td>{formatDetails(entry.details, log.admins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log?.has_more && (
        <p className="muted">
          Showing the newest {log.entries.length} entries. Narrow the filters to see older ones.
        </p>
      )}
    </div>
  );
}
