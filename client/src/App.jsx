import React, { useEffect, useState } from 'react';
import axios from 'axios';

// All requests go to /api/... - nginx rewrites/proxies that to the "server" service.
// This means the client never needs to know the server's real hostname or port.
function App() {
  const [seenIndexes, setSeenIndexes] = useState([]);
  const [values, setValues] = useState({});
  const [index, setIndex] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchValues = async () => {
    try {
      const [allRes, currentRes] = await Promise.all([
        axios.get('/api/values/all'),
        axios.get('/api/values/current'),
      ]);
      setSeenIndexes(allRes.data);
      setValues(currentRes.data);
    } catch (err) {
      console.error('Failed to fetch values', err);
    }
  };

  useEffect(() => {
    fetchValues();
    const interval = setInterval(fetchValues, 2000); // simple polling
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post('/api/values', { index });
      setIndex('');
      fetchValues();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Fibonacci Calculator</h1>
      <p className="subtitle">
        client → nginx → server (Express) → redis + postgres → worker
      </p>

      <form onSubmit={handleSubmit} className="form">
        <label htmlFor="index">Enter your index (0-40):</label>
        <div className="form-row">
          <input
            id="index"
            type="number"
            min="0"
            max="40"
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}

      <h2>Indexes received (Postgres)</h2>
      <div className="pill-row">
        {seenIndexes.length === 0 && <span className="muted">Nothing yet</span>}
        {seenIndexes.map(({ number }, i) => (
          <span className="pill" key={i}>{number}</span>
        ))}
      </div>

      <h2>Calculated results (Redis)</h2>
      <div className="results">
        {Object.keys(values).length === 0 && <span className="muted">Nothing yet</span>}
        {Object.keys(values).map((key) => (
          <div className="result-row" key={key}>
            For index <b>{key}</b>, fib = <b>{values[key]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
