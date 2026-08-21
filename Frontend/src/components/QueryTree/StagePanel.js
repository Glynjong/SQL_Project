import React from 'react';
import { ResultsTable } from '../Common/ResultsTable';
import { costColor } from '../../utils/planUtils';
import '../../App.css';

export const StagePanel = ({ stage, onClose, onNodeClick }) => {
  if (!stage) return null;

  const color = costColor(stage.totalCost);

  return (
    <div className="stage-panel">
      {/* Header */}
      <div className="stage-panel-header" style={{ background: color }}>
        <div>
          <div className="stage-panel-title">{stage.nodeType}</div>
          {stage.relation && (
            <div className="stage-panel-subtitle">
              {stage.relation}
              {stage.alias && stage.alias !== stage.relation ? ` (${stage.alias})` : ''}
            </div>
          )}
        </div>
        <button className="stage-panel-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Stats bar */}
      <div className="stage-panel-stats">
        <span className="stage-stat">
          Est. Cost: <strong style={{ color }}>{stage.totalCost?.toFixed(2)}</strong>
        </span>
        <span className="stage-stat">
          Est. Rows: <strong className="stage-stat-rows">{stage.estimatedRows}</strong>
        </span>
        {stage.width && (
          <span className="stage-stat">
            Width: <strong>{stage.width}</strong>
          </span>
        )}
      </div>

      {/* SQL at this stage */}
      <div className="stage-panel-section">
        <div className="stage-panel-label">SQL at this stage</div>
        <pre className="stage-panel-sql">{stage.stageSQL}</pre>
      </div>

      {/* Filter / Join condition */}
      {(stage.filter || stage.joinFilter) && (
        <div className="stage-panel-section">
          <div className="stage-panel-label">
            {stage.joinFilter ? 'Join Condition' : 'Filter'}
          </div>
          <div className="stage-panel-condition">{stage.joinFilter || stage.filter}</div>
        </div>
      )}

      {/* Data preview label */}
      <div className="stage-panel-data-label">
        {stage.loading
          ? 'Loading data…'
          : stage.error
          ? 'Error'
          : 'Data preview (up to 50 rows)'}
      </div>

      {/* Data */}
      <div className="stage-panel-data">
        {stage.loading && <div className="stage-panel-loading">Fetching data…</div>}
        {stage.error && <div className="stage-panel-error">⚠️ {stage.error}</div>}
        {!stage.loading && !stage.error && <ResultsTable rows={stage.rows} />}
      </div>
    </div>
  );
};
