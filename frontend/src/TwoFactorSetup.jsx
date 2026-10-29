import { useState } from 'react';

// Two-factor setup (card #104): scan a QR code with an authenticator app, then
// type one code from the app to prove it works. The QR code and key are shown
// only during setup and are never stored in the browser.
export default function TwoFactorSetup({ user, apiRequest, onEnabled }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startSetup() {
    setError('');
    setBusy(true);
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
      await apiRequest('/api/auth/two-factor/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setSetup(null);
      setCode('');
      await onEnabled();
    } catch (err) {
      setError(err.message || 'Could not check the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="budget-alerts two-factor" aria-label="Two-factor login">
      <h2>Two-factor login</h2>

      {user.two_factor_enabled ? (
        <p className="two-factor-on">On. Your authenticator app is linked to this account.</p>
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

      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
