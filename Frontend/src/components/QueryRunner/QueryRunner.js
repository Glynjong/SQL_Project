import React from 'react';
import { ResultsTable } from '../Common/ResultsTable';
import { EmptyState } from '../Common/EmptyState';
import { SqlEditor } from '../Common/SqlEditor';
import '../../App.css';

// Same layout as the Query Tree toolbar: auto-growing editor, button on the right.
export const QueryEditor = ({ query, onChange, onExecute, isLoading }) => (
  <div className="tree-toolbar runner-toolbar">
    <SqlEditor value={query} onChange={onChange} />
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        className="btn-primary"
        onClick={onExecute}
        disabled={isLoading}
      >
        {isLoading ? 'Executing...' : 'Run Query'}
      </button>
    </div>
  </div>
);

export const QueryRunner = ({ query, results, isLoading, error, onQueryChange, onExecute }) => (
  <div className="runner-layout">
    <QueryEditor
      query={query}
      onChange={onQueryChange}
      onExecute={onExecute}
      isLoading={isLoading}
    />
    <div className="results-wrap">
      {error && <div className="results-empty results-error">{error}</div>}
      {!error && results.length > 0 && <ResultsTable rows={results} />}
      {!error && results.length === 0 && !isLoading && (
        <EmptyState title="Run a query to see results" />
      )}
    </div>
  </div>
);
