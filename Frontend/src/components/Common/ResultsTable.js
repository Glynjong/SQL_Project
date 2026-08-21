import React from 'react';
import '../../App.css';

export const ResultsTable = ({ rows }) => {
  if (!rows || rows.length === 0)
    return (
      <div className="results-empty">
        <div className="results-empty-icon">📭</div>
        <span>No rows returned</span>
      </div>
    );

  return (
    <table className="results-table">
      <thead>
        <tr>{Object.keys(rows[0]).map((k) => <th key={k}>{k}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {Object.values(row).map((v, j) => (
              <td key={j}>{String(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
