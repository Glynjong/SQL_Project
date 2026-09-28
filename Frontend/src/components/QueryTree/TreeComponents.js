import React, { useRef, useEffect } from 'react';
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
    <span className="tree-legend-hint">💡 Click any node to preview its data</span>
  </div>
);

export const TreeToolbar = ({ query, onQueryChange, onAnalyze, isLoading }) => {
  const textareaRef = useRef(null);
  const lineCount = query ? query.split('\n').length : 1;
  const isLong = lineCount > 3 || (query || '').length > 200;

  // Auto-grow the textarea to fit the query (up to a cap, then it scrolls
  // internally via CSS max-height) — previously a fixed 2-row box, so a
  // long/multi-line query was mostly hidden with only manual internal
  // scrolling and no visual cue that there was more to see.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [query]);

  // Explain and Analyze were merged into one button that always runs
  // Analyze (EXPLAIN ANALYZE), since its output is a superset of Explain's
  // — every plan node's estimated numbers are included alongside the real
  // measured ones. The one thing that trade loses is Explain's guarantee
  // of never executing the query, so mutating statements now get a
  // confirmation prompt here instead — read-only queries run with no
  // extra friction, same as before.
  const handleClick = () => {
    const mutates = /^\s*(insert|update|delete|drop|truncate|alter)\b/i.test(query || '');
    if (mutates && !window.confirm(
      'This looks like it modifies data (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER). ' +
      'Analyze actually executes the query for real, including its side effects. Continue?'
    )) {
      return;
    }
    onAnalyze();
  };

  return (
    <div className="tree-toolbar">
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={textareaRef}
          className="tree-query-editor"
          rows={2}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        {isLong && (
          <span
            style={{
              position: 'absolute',
              bottom: '6px',
              right: '10px',
              fontSize: '10px',
              padding: '2px 7px',
              borderRadius: '999px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            {lineCount} lines
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-success" onClick={handleClick} disabled={isLoading} style={{ background: 'var(--orange)' }}>
          {isLoading ? 'Running…' : '⚙️ Explain'}
        </button>
      </div>
    </div>
  );
};
