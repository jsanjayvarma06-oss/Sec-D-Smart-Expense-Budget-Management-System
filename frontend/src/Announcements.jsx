
import { useCallback, useEffect, useState } from 'react';

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Announcements({ apiRequest }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest('/api/admin/announcements');
      setAnnouncements(result.announcements);
    } catch (err) {
      setError(err.message || 'Could not load announcement history.');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    let cancelled = false;

    apiRequest('/api/admin/announcements')
      .then((result) => {
        if (!cancelled) {
          setAnnouncements(result.announcements);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not load announcement history.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanMessage = message.trim();

    if (!cleanTitle || !cleanMessage) {
      setError('Please enter both a title and a message.');
      return;
    }

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const result = await apiRequest('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: cleanTitle,
          message: cleanMessage,
        }),
      });

      setSuccess(
        `Announcement sent successfully to ${result.announcement.recipient_count} active users.`,
      );

      setTitle('');
      setMessage('');

      await loadAnnouncements();
    } catch (err) {
      setError(err.message || 'Could not send the announcement.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="announcements">
      <section className="expense-section announcement-compose">
        <h3>Send a new announcement</h3>
        <p className="muted">
          This message will be delivered to all active users.
        </p>

        <form className="expense-form" onSubmit={handleSubmit}>
          <label className="announcement-title-field">
            Announcement title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enter announcement title"
              maxLength={100}
              required
            />
            <span className="muted announcement-counter">
              {title.length}/100 characters
            </span>
          </label>

          <label className="announcement-message-field">
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write your announcement here..."
              maxLength={255}
              rows={4}
              required
            />
            <span className="muted announcement-counter">
              {message.length}/255 characters
            </span>
          </label>

          <div className="expense-form-actions">
            <button type="submit" disabled={sending}>
              {sending ? 'Sending...' : 'Send announcement'}
            </button>
          </div>
        </form>

        {success && (
          <p className="success-message" role="status">
            {success}
          </p>
        )}

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="announcement-history">
        <div className="announcement-history-heading">
          <div>
            <h3>Announcement history</h3>
            <p className="muted">
              Previously sent announcements, newest first.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={loadAnnouncements}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading && (
          <p className="muted" role="status">
            Loading announcement history...
          </p>
        )}

        {!loading && announcements.length === 0 && (
          <p className="muted">
            No announcements have been sent yet.
          </p>
        )}

        {!loading && announcements.length > 0 && (
          <div className="expense-table-wrapper">
            <table className="expense-table announcement-table">
              <thead>
                <tr>
                  <th>Title and message</th>
                  <th>Sent by</th>
                  <th>Recipients</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {announcements.map((announcement) => (
                  <tr key={announcement.id}>
                    <td>
                      <strong>{announcement.title}</strong>
                      <p className="announcement-history-message">
                        {announcement.message}
                      </p>
                    </td>

                    <td>{announcement.admin_name || 'Admin'}</td>

                    <td>{announcement.recipient_count}</td>

                    <td>{formatDateTime(announcement.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
