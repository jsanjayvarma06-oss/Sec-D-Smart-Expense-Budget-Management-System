import { useEffect, useState } from 'react';

// Placeholder until the registration, login and dashboard screens are built.
// It calls the API through the Vite proxy to show the frontend, backend and
// database are wired together.
export default function App() {
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((response) => setApiStatus(response.ok ? 'ok' : 'error'))
      .catch(() => setApiStatus('error'));
  }, []);

  return (
    <main className="placeholder">
      <h1>Smart Expense &amp; Budget</h1>
      <p className="muted">The app screens are on their way.</p>
      <p role="status">
        API and database:{' '}
        <strong className={`status status-${apiStatus}`}>
          {apiStatus === 'checking' ? 'checking…' : apiStatus === 'ok' ? 'connected' : 'not reachable'}
        </strong>
      </p>
    </main>
  );
}
