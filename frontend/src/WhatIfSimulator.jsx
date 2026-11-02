import { useState } from 'react';

function formatRupees(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export default function WhatIfSimulator({ apiRequest, month, categories }) {
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSimulation(null);
    const amount = Number(purchaseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a purchase amount greater than zero.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest('/api/what-if/simulate', {
        method: 'POST',
        body: JSON.stringify({
          month,
          purchaseAmount: amount,
          ...(categoryId ? { category_id: categoryId } : {}),
        }),
      });
      setSimulation(result.simulation);
    } catch (err) {
      setError(err.message || 'Could not simulate this purchase.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="expense-section what-if-section" aria-label="Planned purchase simulator">
      <h2>Can I afford this purchase?</h2>
      <p className="muted">Try a planned purchase against your saved monthly budget and spending. This is only a simulation; it will not add an expense.</p>
      <form className="expense-form" onSubmit={handleSubmit}>
        <label>
          Planned purchase amount (₹)
          <input type="number" min="0.01" max="9999999999.99" step="0.01" value={purchaseAmount} onChange={(event) => setPurchaseAmount(event.target.value)} placeholder="e.g. 2500" required />
        </label>
        <label>
          Category (optional)
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Select a category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <div className="expense-form-actions">
          <button type="submit" disabled={busy}>{busy ? 'Calculating…' : 'Check affordability'}</button>
        </div>
      </form>
      {error && <p className="error-message" role="alert">{error}</p>}
      {simulation && (
        <div className={simulation.affordable ? 'what-if-result affordable' : 'what-if-result not-affordable'} role="status" aria-live="polite">
          <h3>{simulation.affordable ? 'Affordable' : 'Not affordable'}</h3>
          <p>Monthly budget: <strong>{formatRupees(simulation.budget_amount)}</strong></p>
          <p>Spent so far: <strong>{formatRupees(simulation.current_spending)}</strong></p>
          <p>Available before purchase: <strong>{formatRupees(simulation.remaining_before_purchase)}</strong></p>
          <p>Purchase: <strong>{formatRupees(simulation.purchase_amount)}</strong></p>
          {simulation.affordable
            ? <p>Remaining after purchase: <strong>{formatRupees(simulation.remaining_budget)}</strong></p>
            : <p>Amount over budget: <strong>{formatRupees(simulation.shortfall)}</strong></p>}
          {!simulation.budget_amount && <p className="muted">You have not set an overall monthly budget for {month}. Set one to get a meaningful affordability result.</p>}
        </div>
      )}
    </section>
  );
}
