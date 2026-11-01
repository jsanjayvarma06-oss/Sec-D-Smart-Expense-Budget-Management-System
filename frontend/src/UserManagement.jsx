import { useEffect, useState } from 'react';

// Users section of the admin panel (story #113, card #116).
// Admins find accounts, unlock them, log them out everywhere, or disable them.
// Privacy rule: zero financial data is ever displayed here.
export default function UserManagement({ apiRequest, currentUser }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const queryParams = new URLSearchParams({
      page: String(page),
      limit: '15',
    });
    if (debouncedSearch.trim()) {
      queryParams.set('search', debouncedSearch.trim());
    }

    apiRequest(`/api/admin/users?${queryParams.toString()}`)
      .then((res) => {
        if (!active) return;
        setUsers(res.users);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load users.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiRequest, page, debouncedSearch, refreshKey]);

  async function executeAction(actionName, endpoint, confirmText) {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const res = await apiRequest(endpoint, { method: 'POST' });
      setMessage(res.message || `${actionName} completed successfully.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || `Failed to ${actionName.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  function handleUnlock(u) {
    executeAction('Unlock account', `/api/admin/users/${u.id}/unlock`, `Unlock account for ${u.email}?`);
  }

  function handleLogoutEverywhere(u) {
    executeAction(
      'Log out everywhere',
      `/api/admin/users/${u.id}/logout`,
      `Log out ${u.email} from all devices? Their active sessions will end immediately.`,
    );
  }

  function handleDisable(u) {
    executeAction(
      'Disable account',
      `/api/admin/users/${u.id}/disable`,
      `Disable account for ${u.email}? They will not be able to log in and all active sessions will be terminated.`,
    );
  }

  function handleEnable(u) {
    executeAction(
      'Re-enable account',
      `/api/admin/users/${u.id}/enable`,
      `Re-enable account for ${u.email}?`,
    );
  }

  return (
    <section className="admin-section user-management-section">
      <div className="admin-section-header">
        <div>
          <h2>User management</h2>
          <p className="muted">
            Find an account, unlock it, terminate all active sessions, or disable access. Total users: {total}.
          </p>
        </div>

        <div className="search-bar">
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>
      </div>

      {error && <div className="alert error-alert" role="alert">{error}</div>}
      {message && <div className="alert success-alert" role="status">{message}</div>}

      {loading ? (
        <p className="muted">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="muted">No user accounts found matching your search.</p>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Sessions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentUser && String(currentUser.id) === String(u.id);

                return (
                  <tr key={u.id} className={u.status === 'disabled' ? 'row-disabled' : ''}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="muted small-text">{u.email}</div>
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'badge-neutral'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-status-${u.status}`}>
                        {u.status === 'disabled'
                          ? 'Disabled'
                          : u.status === 'locked'
                          ? 'Locked'
                          : 'Active'}
                      </span>
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>{u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'}</td>
                    <td>{u.active_sessions}</td>
                    <td>
                      <div className="table-actions">
                        {u.status === 'locked' && (
                          <button
                            type="button"
                            className="btn-sm btn-secondary"
                            onClick={() => handleUnlock(u)}
                            disabled={busy}
                          >
                            Unlock
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-sm btn-secondary"
                          onClick={() => handleLogoutEverywhere(u)}
                          disabled={busy || u.active_sessions === 0}
                          title="Terminate all active sessions"
                        >
                          Log out
                        </button>

                        {u.status === 'disabled' ? (
                          <button
                            type="button"
                            className="btn-sm btn-success"
                            onClick={() => handleEnable(u)}
                            disabled={busy}
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-sm btn-danger"
                            onClick={() => handleDisable(u)}
                            disabled={busy || isSelf}
                            title={isSelf ? 'You cannot disable your own admin account' : 'Disable account'}
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || busy}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || busy}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
