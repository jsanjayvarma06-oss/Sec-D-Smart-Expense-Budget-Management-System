// Subscription detector (story #90): repeating payments found in the user's
// expenses, with a one-click "Make recurring" and a note when the price went up.

function formatAmount(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function SubscriptionsCard({ subscriptions, savingKey, onMakeRecurring }) {
  return (
    <section className="budget-alerts subscriptions" aria-label="Subscriptions">
      <h2>Subscriptions we found</h2>
      <p className="muted">
        Payments to the same merchant, for a similar amount, about a week or a month apart,
        at least 3 times. Add a merchant to your expenses so they can be matched.
      </p>

      {subscriptions.length === 0 ? (
        <p>No repeating payments found yet.</p>
      ) : (
        <ul className="subscription-list">
          {subscriptions.map((subscription) => (
            <li className="subscription-item" key={subscription.merchant_key}>
              <div>
                <strong>{subscription.merchant}</strong>{' '}
                <span className="subscription-cycle">{subscription.cycle}</span>
                <p className="muted">
                  About {formatAmount(subscription.typical_amount)} · {subscription.charge_count} charges ·
                  next expected {formatDate(subscription.next_expected_date)}
                </p>
                {subscription.price_rise && (
                  <p className="subscription-rise">
                    Price went up {subscription.price_rise.percent}%:{' '}
                    {formatAmount(subscription.price_rise.from_amount)} →{' '}
                    {formatAmount(subscription.price_rise.to_amount)} on{' '}
                    {formatDate(subscription.price_rise.charged_on)}
                  </p>
                )}
              </div>

              {subscription.already_recurring ? (
                <span className="subscription-done">Recurring payment set up</span>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={savingKey !== ''}
                  onClick={() => onMakeRecurring(subscription)}
                >
                  {savingKey === subscription.merchant_key ? 'Saving…' : 'Make recurring'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
