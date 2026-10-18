import React from 'react';
import { SqlEditor } from '../Common/SqlEditor';
import '../../App.css';

export const TreeLegend = () => (
  <div className="tree-legend">
    <span>
      <span className="legend-dot legend-dot--green" />
      Low cost
    </span>
    <span>
      <span className="legend-dot legend-dot--orange" />
      Medium cost (&gt;100)
    </span>
    <span>
      <span className="legend-dot legend-dot--red" />
      High cost (&gt;1000)
    </span>
    <span className="tree-legend-hint">Click any node to preview its data</span>
  </div>
);

export const TreeToolbar = ({ query, onQueryChange, onAnalyze, isLoading }) => {
  // Explain and Analyze were merged into one "Explain" button that always runs
  // EXPLAIN ANALYZE, since its output is a superset of plain EXPLAIN's
  // — every plan node's estimated numbers are included alongside the real
  // measured ones. The one thing that trade loses is Explain's guarantee
  // of never executing the query, so mutating statements now get a
  // confirmation prompt here instead — read-only queries run with no
  // extra friction, same as before.
  const handleClick = () => {
    const mutates = /^\s*(insert|update|delete|drop|truncate|alter)\b/i.test(query || '');
    if (mutates && !window.confirm(
      'This looks like it modifies data (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER). ' +
      'Explain runs the statement with EXPLAIN ANALYZE to measure it, then rolls the transaction back, ' +
      'so the data is not changed (ID sequences may still advance). Continue?'
    )) {
      return;
    }
    onAnalyze();
  };

  return (
    <div className="tree-toolbar">
      <SqlEditor value={query} onChange={onQueryChange} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-success" onClick={handleClick} disabled={isLoading} style={{ background: 'var(--orange)' }}>
          {isLoading ? 'Running…' : 'Explain'}
        </button>
      </div>
    </div>
  );
};
