import { useState } from 'react';

// Bank statement CSV import modal (cards #100, #101, #102).
// Supports SBI, HDFC, ICICI, and generic CSV layouts, rejects > 1 MB files,
// shows parsed preview with duplicate flags & category suggestions,
// and submits selected transactions for atomic batch import.
export default function StatementImport({ apiRequest, categories, onImportSuccess, onClose }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [rowCategories, setRowCategories] = useState({});

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 1024 * 1024) {
      setError('File exceeds maximum allowed size of 1 MB.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError('');
  }

  async function handleParse() {
    if (!file) {
      setError('Please choose a CSV file first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const csvText = await file.text();
      const res = await apiRequest('/api/expenses/import/preview', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
      });

      if (!res.transactions || res.transactions.length === 0) {
        setError('No debit transactions found in the uploaded statement.');
        setPreview(null);
        return;
      }

      setPreview(res);

      // Default: select all non-duplicate transactions
      const initialSelected = new Set();
      const initialCats = {};
      res.transactions.forEach((tx, idx) => {
        if (!tx.is_duplicate) {
          initialSelected.add(idx);
        }
        initialCats[idx] = tx.category_id || '';
      });

      // If all are marked duplicates, select none by default to prevent accidental double-entry
      setSelectedIndices(initialSelected);
      setRowCategories(initialCats);
    } catch (err) {
      setError(err.message || 'Could not parse statement file.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(idx) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function selectAll() {
    if (!preview) return;
    const all = new Set(preview.transactions.map((_, i) => i));
    setSelectedIndices(all);
  }

  function deselectAll() {
    setSelectedIndices(new Set());
  }

  function selectNonDuplicates() {
    if (!preview) return;
    const nonDups = new Set(
      preview.transactions
        .map((tx, i) => (!tx.is_duplicate ? i : null))
        .filter((i) => i !== null),
    );
    setSelectedIndices(nonDups);
  }

  function updateCategory(idx, catId) {
    setRowCategories((prev) => ({
      ...prev,
      [idx]: catId,
    }));
  }

  async function handleImport() {
    if (!preview || selectedIndices.size === 0) {
      setError('No transactions selected for import.');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const items = Array.from(selectedIndices).map((idx) => {
        const tx = preview.transactions[idx];
        return {
          date: tx.date,
          amount: tx.amount,
          merchant: tx.merchant || null,
          note: tx.note || null,
          category_id: rowCategories[idx] || null,
        };
      });

      const res = await apiRequest('/api/expenses/import', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });

      onImportSuccess(res.count ?? items.length);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to import transactions. No expenses were saved.');
    } finally {
      setImporting(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <div className="modal-content statement-import-modal">
        <div className="modal-header">
          <h2 id="import-modal-title">Import Bank Statement (CSV)</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && (
          <div className="alert error-alert" role="alert">
            {error}
          </div>
        )}

        {!preview ? (
          <div className="statement-upload-step">
            <p className="muted">
              Upload a bank statement in CSV format. Supported layouts: <strong>SBI, HDFC, ICICI</strong>,
              and generic statements with Date, Description, and Debit columns.
            </p>

            <div className="file-dropzone">
              <label htmlFor="statement-file-input" className="file-label">
                Choose CSV file (max 1 MB)
              </label>
              <input
                id="statement-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              {file && (
                <p className="selected-file-info">
                  Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={handleParse}
                disabled={!file || loading}
              >
                {loading ? 'Reading & Analyzing…' : 'Preview Statement'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="statement-preview-step">
            <div className="preview-summary-bar">
              <div>
                <strong>{preview.total_found}</strong> debit transactions found.
                Selected: <strong>{selectedIndices.size}</strong> of {preview.total_found}.
              </div>

              <div className="preview-selection-actions">
                <button type="button" className="btn-sm btn-secondary" onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="btn-sm btn-secondary" onClick={deselectAll}>
                  Deselect all
                </button>
                {preview.duplicate_count > 0 && (
                  <button type="button" className="btn-sm btn-secondary" onClick={selectNonDuplicates}>
                    Select non-duplicates only
                  </button>
                )}
              </div>
            </div>

            {preview.duplicate_count > 0 && (
              <div className="alert warning-alert" role="status">
                ⚠️ <strong>{preview.duplicate_count}</strong> transaction(s) match existing expenses in your account
                and have been unselected by default to prevent duplicate entries.
              </div>
            )}

            <div className="table-responsive import-preview-table-wrap">
              <table className="admin-table import-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIndices.size === preview.transactions.length && preview.transactions.length > 0}
                        onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                        aria-label="Select or deselect all rows"
                      />
                    </th>
                    <th>Date</th>
                    <th>Merchant / Description</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.transactions.map((tx, idx) => {
                    const isSelected = selectedIndices.has(idx);
                    return (
                      <tr key={idx} className={tx.is_duplicate ? 'row-duplicate' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(idx)}
                            aria-label={`Select transaction ${idx + 1}`}
                          />
                        </td>
                        <td>{tx.date}</td>
                        <td>
                          <strong>{tx.merchant || 'Unknown'}</strong>
                          {tx.note && <div className="muted small-text">{tx.note}</div>}
                        </td>
                        <td className="amount-cell">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td>
                          <select
                            value={rowCategories[idx] ?? ''}
                            onChange={(e) => updateCategory(idx, e.target.value)}
                            aria-label={`Category for transaction ${idx + 1}`}
                          >
                            <option value="">(No category)</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {tx.is_duplicate ? (
                            <span className="badge badge-warning" title="Matches an existing recorded expense">
                              Duplicate
                            </span>
                          ) : (
                            <span className="badge badge-success">New</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={handleImport}
                disabled={selectedIndices.size === 0 || importing}
              >
                {importing
                  ? 'Importing…'
                  : `Import ${selectedIndices.size} Expense${selectedIndices.size === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPreview(null);
                  setError('');
                }}
                disabled={importing}
              >
                Choose another file
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={importing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
