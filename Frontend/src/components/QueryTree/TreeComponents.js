import React from 'react';
import '../../../App.css';

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

export const TreeToolbar = ({ query, onQueryChange, onExplain, isLoading }) => (
  <div className="tree-toolbar">
    <textarea
      className="tree-query-editor"
      rows={2}
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
    />
    <button className="btn-success" onClick={onExplain} disabled={isLoading}>
      {isLoading ? 'Analyzing…' : '🌳 Explain'}
    </button>
  </div>
);
