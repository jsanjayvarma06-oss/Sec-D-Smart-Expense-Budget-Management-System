import { useCallback, useEffect, useState } from 'react';

// Categories section of the admin panel (cards #128, #129): add, rename or
// remove the built-in categories every user sees. Admins only ever see the
// category names here, never anyone's expenses, budgets or notes. A category
// that people are still using can be renamed but not removed.
export default function AdminCategories({ apiRequest }) {
  const [categories, setCategories] = useState([]);
  const [suggestionNames, setSuggestionNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await apiRequest('/api/admin/categories');
    setCategories(result.categories);
    setSuggestionNames(result.suggestion_names);
  }, [apiRequest]);

  useEffect(() => {
    let active = true;

    apiRequest('/api/admin/categories')
      .then((result) => {
        if (!active) return;
        setCategories(result.categories);
        setSuggestionNames(result.suggestion_names);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load the categories.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiRequest]);

  // Runs one change, then shows the new list, or the reason it was refused.
  async function change(action, successMessage) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await action();
      await load();
      setMessage(successMessage);
      return true;
    } catch (err) {
      setError(err.message || 'Could not save the change.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError('Enter a category name.');
      return;
    }

    const saved = await change(
      () => apiRequest('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name }) }),
      `Added "${name}". Every user can now use it.`,
    );
    if (saved) setNewName('');
  }

  function startRename(category) {
    setEditingId(category.id);
    setEditName(category.name);
    setError('');
    setMessage('');
  }

  async function handleRename(event, category) {
    event.preventDefault();
    const name = editName.trim();
    if (!name) {
      setError('Enter a category name.');
      return;
    }

    const saved = await change(
      () => apiRequest(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }),
      `Renamed "${category.name}" to "${name}". Everyone's records in it now show the new name.`,
    );
    if (saved) setEditingId('');
  }

  async function handleRemove(category) {
    const warning = suggestionNames.includes(category.name)
      ? ` Merchant names will no longer suggest "${category.name}".`
      : '';
    const confirmed = window.confirm(
      `Remove the built-in category "${category.name}" for every user?${warning} This cannot be undone.`,
    );
    if (!confirmed) return;

    await change(
      () => apiRequest(`/api/admin/categories/${encodeURIComponent(category.id)}`, { method: 'DELETE' }),
      `Removed "${category.name}".`,
    );
  }

  return (
    <div className="admin-categories">
      <p className="muted">
        These are the categories every user sees. You see names only, never anyone&apos;s spending.
        Renaming a category changes it for everyone. A category that people are still using
        cannot be removed, so rename it instead.
      </p>

      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}

      <form className="expense-form" onSubmit={handleAdd}>
        <label>
          New built-in category
          <input
            type="text"
            maxLength={50}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g. Pet care"
          />
        </label>

        <div className="expense-form-actions">
          <button type="submit" disabled={busy}>Add category</button>
        </div>
      </form>

      {loading ? (
        <p className="muted">Loading the categories…</p>
      ) : (
        <div className="expense-table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    {editingId === category.id ? (
                      <form className="inline-form" onSubmit={(event) => handleRename(event, category)}>
                        <input
                          type="text"
                          maxLength={50}
                          value={editName}
                          aria-label={`New name for ${category.name}`}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                        <button type="submit" disabled={busy}>Save</button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setEditingId('')}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <strong>{category.name}</strong>
                        {suggestionNames.includes(category.name) && (
                          <p className="muted expense-note">
                            Used to suggest a category from merchant names.
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {editingId !== category.id && (
                      <div className="table-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => startRename(category)}
                          disabled={busy}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleRemove(category)}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
