import { useState } from 'react';

// Two-factor setup (cards #104, #105, #106): scan a QR code with an authenticator app,
// receive 10 single-use backup codes, or turn off / regenerate codes.
export default function TwoFactorSetup({ user, apiRequest, onEnabled }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);

  // States for turning off or regenerating
  const [actionModal, setActionModal] = useState(null); // 'disable' | 'regenerate' | null
  const [actionCode, setActionCode] = useState('');

  async function startSetup() {
    setError('');
    setBusy(true);
    setBackupCodes(null);
    try {
      setSetup(await apiRequest('/api/auth/two-factor/setup', { method: 'POST' }));
      setCode('');
    } catch (err) {
      setError(err.message || 'Could not start two-factor setup.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest('/api/auth/two-factor/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setSetup(null);
      setCode('');
      if (res.backup_codes && res.backup_codes.length > 0) {
        setBackupCodes(res.backup_codes);
      }
      await onEnabled();
    } catch (err) {
      setError(err.message || 'Could not check the code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/auth/two-factor/disable', {
        method: 'POST',
        body: JSON.stringify({ code: actionCode }),
      });
      setActionModal(null);
      setActionCode('');
      setBackupCodes(null);
      await onEnabled();
    } catch (err) {
      setError(err.message || 'Could not turn off two-factor authentication.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest('/api/auth/two-factor/backup-codes/regenerate', {
        method: 'POST',
        body: JSON.stringify({ code: actionCode }),
      });
      setActionModal(null);
      setActionCode('');
      setBackupCodes(res.backup_codes);
    } catch (err) {
      setError(err.message || 'Could not regenerate backup codes.');
    } finally {
      setBusy(false);
    }
  }

  function copyBackupCodes() {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join('\n'));
      alert('Backup codes copied to clipboard!');
    }
  }

  return (
    <section className="budget-alerts two-factor" aria-label="Two-factor login">
      <h2>Two-factor login</h2>

      {user.two_factor_enabled ? (
        <div className="two-factor-manage">
          <p className="two-factor-on">On. Your authenticator app is linked to this account.</p>
          <div className="two-factor-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => { setActionModal('regenerate'); setError(''); setActionCode(''); }}
              disabled={busy}
            >
              Regenerate backup codes
            </button>
            <button
              type="button"
              className="secondary-button danger-button"
              onClick={() => { setActionModal('disable'); setError(''); setActionCode(''); }}
              disabled={busy}
            >
              Turn off two-factor login
            </button>
          </div>
        </div>
      ) : !setup ? (
        <>
          <p>
            Add a second step to your account with a code from an authenticator app such as
            Google Authenticator or Microsoft Authenticator.
          </p>
          <button type="button" onClick={startSetup} disabled={busy}>
            {busy ? 'Starting…' : 'Turn on two-factor login'}
          </button>
        </>
      ) : (
        <div className="two-factor-setup">
          <img
            src={setup.qr_code}
            alt="QR code to scan with your authenticator app"
            width="220"
            height="220"
          />
          <div>
            <ol>
              <li>Open your authenticator app and scan this QR code.</li>
              <li>
                Can&apos;t scan it? Enter this key instead:{' '}
                <code className="two-factor-key">{setup.manual_key}</code>
              </li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>

            <form onSubmit={confirm} className="two-factor-form">
              <label>
                Code from the app
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength="7"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Confirm and turn on'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => { setSetup(null); setError(''); }}
                disabled={busy}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal for action verification (turn off or regenerate) */}
      {actionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{actionModal === 'disable' ? 'Turn off two-factor login' : 'Regenerate backup codes'}</h3>
            <p>
              Enter the 6-digit code from your authenticator app to confirm this action.
            </p>
            <form onSubmit={actionModal === 'disable' ? handleDisable : handleRegenerate}>
              <label>
                6-digit code or backup code:
                <input
                  type="text"
                  value={actionCode}
                  onChange={(e) => setActionCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={busy}>
                  {busy ? 'Verifying…' : actionModal === 'disable' ? 'Confirm Turn Off' : 'Regenerate Codes'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActionModal(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Display backup codes */}
      {backupCodes && (
        <div className="backup-codes-card" role="region" aria-label="Backup codes">
          <h3>Your single-use backup codes</h3>
          <p className="muted">
            Save these codes in a safe place. Each code can be used once to log in if you lose access to your authenticator app.
          </p>
          <div className="backup-codes-grid">
            {backupCodes.map((c, i) => (
              <code key={i} className="backup-code-item">{c}</code>
            ))}
          </div>
          <div className="backup-codes-actions">
            <button type="button" className="secondary-button" onClick={copyBackupCodes}>
              Copy codes to clipboard
            </button>
            <button type="button" className="secondary-button" onClick={() => setBackupCodes(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
