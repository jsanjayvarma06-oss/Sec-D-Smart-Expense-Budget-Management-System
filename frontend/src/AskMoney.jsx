import { useEffect, useState } from 'react';

const DEFAULT_SUGGESTIONS = [
  'How much did I spend this month?',
  'How much did I spend on Food last month?',
  'What was my biggest expense this month?',
  'Did I spend more than last month?',
  'How much budget do I have left?',
  'How much did I earn this month?',
];

export default function AskMoney({ apiRequest }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);

  useEffect(() => {
    let active = true;
    apiRequest('/api/insights/ask/suggestions')
      .then((res) => {
        if (active && res.suggestions && res.suggestions.length > 0) {
          setSuggestions(res.suggestions);
        }
      })
      .catch(() => {
        // Fallback to default suggestions on error
      });
    return () => {
      active = false;
    };
  }, [apiRequest]);

  async function handleAsk(queryText) {
    const q = (queryText || question).trim();
    if (!q) {
      setError('Please enter a question.');
      return;
    }
    if (q.length > 200) {
      setError('Question is too long (maximum 200 characters).');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await apiRequest('/api/insights/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      setResult(res);
      setQuestion(q);
    } catch (err) {
      setError(err.message || 'Could not answer your question.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestionClick(suggested) {
    setQuestion(suggested);
    handleAsk(suggested);
  }

  return (
    <section className="ask-money-section" aria-labelledby="ask-money-title">
      <div className="section-header">
        <div>
          <h2 id="ask-money-title">Ask Questions About Your Money</h2>
          <p className="muted">
            Ask simple questions in plain English without digging through records.
            All answers are computed privately from your data (no external AI).
          </p>
        </div>
      </div>

      <form
        className="ask-money-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
      >
        <div className="ask-money-input-wrapper">
          <input
            type="text"
            className="ask-money-input"
            placeholder="e.g. How much did I spend on Food last month?"
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
            aria-label="Ask a financial question"
          />
          <button
            type="submit"
            className="primary-button ask-money-submit"
            disabled={loading || !question.trim()}
          >
            {loading ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>

      {/* Suggested question chips */}
      <div className="ask-money-suggestions" aria-label="Example questions">
        <span className="muted" style={{ fontSize: '13px', fontWeight: 600 }}>Try asking:</span>
        <div className="ask-money-chips">
          {suggestions.map((item) => (
            <button
              type="button"
              key={item}
              className="ask-money-chip"
              onClick={() => handleSuggestionClick(item)}
              disabled={loading}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="error-message" role="alert" style={{ marginTop: '14px' }}>
          {error}
        </p>
      )}

      {/* Result Display */}
      {result && (
        <article className="ask-money-result" aria-live="polite">
          <div className="ask-money-result-header">
            <span className="ask-money-result-badge">
              {result.intent === 'unsupported' ? 'Tip' : 'Answer'}
            </span>
            <span className="muted ask-money-asked-q">“{result.question}”</span>
          </div>

          <p className="ask-money-answer-text">{result.answer}</p>

          {/* Figures summary if available */}
          {result.figures && Object.keys(result.figures).length > 0 && result.intent !== 'unsupported' && (
            <div className="ask-money-figures">
              {result.figures.period && (
                <span className="figure-pill">
                  <strong>Period:</strong> {result.figures.period}
                </span>
              )}
              {result.figures.category && (
                <span className="figure-pill">
                  <strong>Category:</strong> {result.figures.category}
                </span>
              )}
              {result.figures.total_spent !== undefined && (
                <span className="figure-pill">
                  <strong>Spent:</strong> ₹{Number(result.figures.total_spent).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
              {result.figures.remaining_amount !== undefined && (
                <span className="figure-pill">
                  <strong>Remaining Budget:</strong> ₹{Number(result.figures.remaining_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
              {result.figures.total_income !== undefined && (
                <span className="figure-pill">
                  <strong>Income:</strong> ₹{Number(result.figures.total_income).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}
        </article>
      )}
    </section>
  );
}
