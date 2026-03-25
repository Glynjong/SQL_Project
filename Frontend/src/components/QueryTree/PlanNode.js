import React from 'react';
import { Handle, Position } from 'reactflow';
import { costColor } from '../../utils/planUtils';
import '../../../App.css';

export const PlanNode = ({ data }) => {
  const color = costColor(data.totalCost);

  return (
    <div className="plan-node" style={{ borderColor: color }}>
      <Handle type="target" position={Position.Top} style={{ background: color }} />

      <div className="plan-node-header" style={{ background: color }}>
        {data.nodeType}
      </div>

      <div className="plan-node-body">
        {data.relation && (
          <div className="plan-node-relation">
            📋 {data.relation}
            {data.alias && data.alias !== data.relation ? ` (${data.alias})` : ''}
          </div>
        )}
        {data.indexName && <div className="plan-node-index">🗂 {data.indexName}</div>}
        {data.filter && <div className="plan-node-filter">🔍 {data.filter}</div>}
        {data.joinFilter && <div className="plan-node-filter">🔗 {data.joinFilter}</div>}

        <div className="plan-node-stats">
          <span className="plan-stat">
            Cost: <strong style={{ color }}>{data.totalCost?.toFixed(2)}</strong>
          </span>
          <span className="plan-stat">
            Rows: <strong className="plan-stat-rows">{data.rows}</strong>
          </span>
          {data.width && (
            <span className="plan-stat">
              Width: <strong>{data.width}</strong>
            </span>
          )}
        </div>

        <div className="plan-node-hint">Click to preview data →</div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  );
};
