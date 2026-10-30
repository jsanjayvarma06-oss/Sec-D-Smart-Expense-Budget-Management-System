import { useEffect, useState } from 'react';

// System health section of the admin panel (story #120). The server decides
// each item's state; this screen only shows it, in words as well as colour.
const STATE_LABELS = { green: 'OK', amber: 'Check soon', red: 'Needs attention' };

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatAge(value, now) {
  const hours = Math.floor((now - new Date(value)) / 3_600_000);
  if (hours < 1) return 'less than an hour ago';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

// What each row says. `error` is set when the server couldn't run that check.
function describe(id, item, checkedAt) {
  if (item.error) return item.error;
  switch (id) {
    case 'api':
      return `Running version ${item.version}, up for ${formatDuration(item.uptime_seconds)}`;
    case 'database':
      return `Connected, answered in ${item.response_ms < 1 ? 'under 1' : item.response_ms} ms`;
    case 'migrations':
      return item.pending.length === 0
        ? `All ${item.applied} applied (latest ${item.latest})`
        : `${item.applied} applied, ${item.pending.length} waiting: ${item.pending.join(', ')}. Run npm run migrate.`;
    case 'database_size':
      return formatBytes(item.bytes);
    case 'last_backup':
      return item.at
        ? `${formatDateTime(item.at)} (${formatAge(item.at, new Date(checkedAt))})`
        : 'No backup found. Run npm run db:backup.';
    case 'errors':
      return `${item.count} since ${formatDateTime(item.since)}`;
    default:
      return '';
  }
}

const ITEMS = [
  ['api', 'API'],
  ['database', 'Database'],
  ['migrations', 'Migrations'],
  ['database_size', 'Database size'],
  ['last_backup', 'Last backup'],
  ['errors', 'Errors in the last 24 hours'],
];

export default function SystemHealth({ apiRequest }) {
  // Each press of "Check again" bumps check; the screen is loading until the
  // answer for the latest check arrives.
  const [check, setCheck] = useState(0);
  const [result, setResult] = useState({ health: null, error: '', check: -1 });
  const { health, error } = result;
  const loading = result.check !== check;

  useEffect(() => {
    let active = true;

    apiRequest('/api/admin/health')
      .then((response) => {
        if (active) setResult({ health: response.health, error: '', check });
      })
      .catch((err) => {
        if (active) {
          setResult((previous) => ({
            ...previous,
            error: err.message || 'Could not check system health.',
            check,
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [apiRequest, check]);

  return (
    <div className="system-health">
      <div className="system-health-header">
        <p className="muted">
          {health ? `Checked ${formatDateTime(health.checked_at)}` : 'Checking…'}
        </p>
        <button type="button" className="secondary-button" onClick={() => setCheck((value) => value + 1)} disabled={loading}>
          {loading ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}

      {health && (
        <ul className="health-list">
          {ITEMS.map(([id, label]) => {
            const item = health.items[id];
            return (
              <li key={id} className={`health-item health-${item.state}`}>
                <span className="health-dot" aria-hidden="true" />
                <div>
                  <strong>{label}</strong>
                  <p className="muted">{describe(id, item, health.checked_at)}</p>
                </div>
                <span className="health-state">{STATE_LABELS[item.state]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
