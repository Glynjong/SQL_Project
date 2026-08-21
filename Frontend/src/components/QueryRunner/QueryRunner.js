import React from 'react';
import { ResultsTable } from '../Common/ResultsTable';
import { EmptyState } from '../Common/EmptyState';
import '../../App.css';

export const QueryEditor = ({ query, onChange, onExecute, isLoading }) => (
  <div className="query-editor-wrap">
    <div className="query-editor-label">SQL Query</div>
    <textarea
      className="query-editor"
      value={query}
      onChange={(e) => onChange(e.target.value)}
    />
    <div className="runner-actions">
      <button
        className="btn-primary"
        onClick={onExecute}
        disabled={isLoading}
      >
        {isLoading ? 'Executing...' : '▶ Run Query'}
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
      {error && <div className="results-empty results-error">⚠️ {error}</div>}
      {!error && results.length > 0 && <ResultsTable rows={results} />}
      {!error && results.length === 0 && !isLoading && (
        <EmptyState title="Run a query to see results" />
      )}
    </div>
  </div>
);
