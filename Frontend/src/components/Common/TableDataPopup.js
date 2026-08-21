import React from 'react';
import { ResultsTable } from './ResultsTable';
import '../../App.css';

export const TableDataPopup = ({ tableName, data, isLoading, error, onClose }) => {
  if (!tableName) return null;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h2>{tableName.toUpperCase()}</h2>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-content">
          {isLoading && (
            <div className="popup-loading">Loading data...</div>
          )}
          {error && (
            <div className="popup-error">Error: {error}</div>
          )}
          {!isLoading && !error && data && data.length > 0 && (
            <ResultsTable rows={data} />
          )}
          {!isLoading && !error && data && data.length === 0 && (
            <div className="popup-empty">No data</div>
          )}
        </div>
      </div>
    </div>
  );
};
