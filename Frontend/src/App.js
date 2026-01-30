import React, { useState, useEffect } from 'react';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [tables, setTables] = useState([]);

  // --- 1. Fetch the list of tables (Metadata) ---
  const fetchTableList = async () => {
    const res = await fetch('http://localhost:5000/run-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public';" }),
    });
    const data = await res.json();
    if (data.success) setTables(data.rows);
  };

  useEffect(() => { fetchTableList(); }, []);

  // --- 2. The Execution Function ---
  // We wrap this in useCallback so we can call it from other functions reliably
  const executeQuery = async (overrideQuery) => {
    const sqlToSend = overrideQuery || query;
    const response = await fetch('http://localhost:5000/run-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sqlToSend }),
    });
    const data = await response.json();
    if (data.success) {
      setResults(data.rows);
    } else {
      alert("Error: " + data.error);
    }
  };

  // --- 3. The Sidebar Click Handler ---
  const handleTableClick = (tableName) => {
    const newQuery = `SELECT * FROM ${tableName};`;
    setQuery(newQuery);   // Updates the text area
    executeQuery(newQuery); // Runs the query immediately
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* SIDEBAR */}
      <div style={{ width: '250px', borderRight: '1px solid #ddd', padding: '20px', backgroundColor: '#f9f9f9' }}>
        <h3 style={{ marginTop: 0 }}>Tables</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tables.map((t) => (
            <li 
              key={t.tablename}
              onClick={() => handleTableClick(t.tablename)}
              style={{ 
                padding: '10px', 
                cursor: 'pointer', 
                borderRadius: '4px',
                borderBottom: '1px solid #eee',
                backgroundColor: query.includes(t.tablename) ? '#e6f7ff' : 'transparent'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseOut={(e) => e.target.style.backgroundColor = query.includes(t.tablename) ? '#e6f7ff' : 'transparent'}
            >
              📄 {t.tablename}
            </li>
          ))}
        </ul>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h2>Visual SQL Debugger</h2>
        <textarea 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          placeholder="Type SQL or click a table..."
          style={{ width: '100%', height: '150px', padding: '10px', fontSize: '16px', fontFamily: 'monospace' }}
        />
        <button 
          onClick={() => executeQuery()} 
          style={{ marginTop: '10px', padding: '10px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          Run Custom Query
        </button>

        <h3>Data Preview</h3>
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ccc', marginTop: '10px' }}>
          {results.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#eee' }}>
                  {Object.keys(results[0]).map(key => (
                    <th key={key} style={{ border: '1px solid #ddd', padding: '8px' }}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} style={{ border: '1px solid #ddd', padding: '8px' }}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ padding: '20px', color: '#666' }}>No data to display. Click a table to preview it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;